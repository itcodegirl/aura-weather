# Case Study — The Aura Weather Trust Contract

> A weather dashboard that silently turns missing data into "0%" is
> worse than one that says "unavailable." It converts a known unknown
> into a confidently wrong reading.

<video src="screenshots/trust-contract-demo.webm" controls muted loop playsinline width="720">
  Your browser does not render embedded video. Run
  <code>npm run record:trust-contract-demo</code> from the project
  root to regenerate the demo, or open
  <code>http://127.0.0.1:5173/?mock=missing</code> on a local dev
  server to see the trust-contract state directly.
</video>

*(The clip toggles from the live forecast to `?mock=missing` so the
hero card renders muted "—" placeholders instead of fake `0%`
humidity / `0 hPa` pressure / `—°F` temperatures.)*

## TL;DR

During a structured audit of Aura Weather, I found and closed an
entire class of bugs caused by JavaScript's `Number(null) === 0`
behaviour. Missing humidity rendered as `"0%"`. A null pressure
reading rendered as `"0 hPa"`. A null geolocation coordinate parsed
to `(0, 0)` Null Island. A null `lastUpdatedAt` timestamp produced a
"Stale data (millions m old)" warning. All of these are confident
lies — the dashboard saying "I know" when it does not.

The fix runs deeper than swapping a few `Number()` calls. It became a
**Data Trust Contract**: a single rule (*a missing reading is shown
as missing, never as zero*) enforced at four layers of the stack and
locked in by tests at every layer. The contract is the project's
strongest portfolio narrative.

## The product

[Aura Weather](https://github.com/itcodegirl/aura-weather) is a
React 19 + Vite 8 weather intelligence dashboard. No backend for the
forecast itself; an optional Supabase-backed rain-alert feature adds one. No
component library, no UI framework beyond Lucide icons. Free
Open-Meteo + NOAA/NWS APIs power live conditions, hourly + 7-day
forecasts, air-quality, severe-alerts, and a 30-year historical
climate comparison.

## The bug

Open-Meteo occasionally returns `null` for individual fields when a
station is offline or a sample is missing. The API normalization
layer was using:

```js
function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
```

`Number(null)` is `0`. `Number.isFinite(0)` is `true`. So `toNumber(null)`
returned `0`, not `null` — every downstream consumer received a real
number that looked valid but was synthesized.

The same pattern showed up in:

- coordinate parsing → `(null, null)` → `(0, 0)` Null Island
- archive-sample averaging → null samples averaged in as 0°F
- timestamp comparisons → null `lastUpdatedAt` → "minutes since the
  Unix epoch"
- temperature converters → `convertTemp(null)` returned 0
- per-element parsers in HourlyCard / ForecastCard / NowcastCard
- consumer-side guards like `Number.isFinite(Number(value))` which
  passes for `null`

Six independent inline coercions, each technically defensible on its
own, combined to make the dashboard quietly lie about every field.

## The trust contract

I rewrote the contract to enforce *a missing reading is shown as
missing, never as zero* at four layers. Each layer has its own
job; the next layer downstream trusts the previous one's output.

### Layer 1 — Strict numeric helper at the API boundary

A single `toFiniteNumber()` function in `src/utils/numbers.js` that
rejects every value JavaScript would silently coerce to 0:

```js
export function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "object") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
```

8 unit tests pin the behaviour against `null`, `undefined`, `""`,
`true`/`false`, arrays, objects, `NaN`, and `Infinity`.

### Layer 2 — Per-element parsers

Open-Meteo's hourly/daily/minutely fields arrive as raw arrays.
HourlyCard, ForecastCard, NowcastCard, and `useRainAnalysis` each
parse per-slot values through `toFiniteNumber` so a single null
entry becomes a chart gap rather than a fake `0°F` point.

The temperature converters (`convertTemp`, `toFahrenheit`,
`toCelsius`) use the same guard so a null input returns `NaN` —
which downstream consumers correctly fall back to `"—"` for.

### Layer 3 — Component fallback rendering

Two helpers in `src/utils/temperature.js` enforce the visible side
of the contract:

```js
formatTemperatureValue(null, "F")    // "—"
formatTemperatureWithUnit(null, "F") // "—"  (not "—°F")
formatTemperatureWithUnit(67, "F")   // "67°F"
```

The unit suffix is suppressed on the missing path so the UI never
renders the misleading `"—°F"` string. The hero card hides its 122px
unit `<span>` entirely when the temperature is missing, and shows the
em-dash at a smaller, muted size.

### Layer 4 — Visual + screen-reader cue

The `Stat` primitive auto-detects the missing placeholder and:

- Adds an `.is-missing` modifier (muted color, normal weight) so
  sighted users can distinguish missing from zero at a glance.
- Wraps the glyph in a `<span aria-label="No data available">` so
  assistive tech announces "no data available" instead of speaking
  the literal "em dash" character.

When any hero stat is missing, the card surfaces a helper note:

> *Some readings are unavailable from the provider. Aura shows "—"
> instead of a fallback value to keep the rest of the forecast
> trustworthy.*

## Test pyramid

Every layer has a test that locks the contract. Without these the
fix would slowly drift back as new code shipped:

| Layer | Test |
|---|---|
| Strict helper | `numbers.test.mjs` (8 tests) |
| API normalization | `transforms.test.mjs` (6 tests) |
| Archive averaging | `openMeteo.test.mjs#fetchHistoricalTemperatureAverage` (2 tests) |
| Component fallback | `temperature.test.mjs` (8 tests) |
| Stat primitive | `Stat.render.test.mjs` (4 React render tests) |
| Hero card DOM | `HeroCard.render.test.mjs` (6 React render tests) |
| Metric card DOM | `MetricCard.render.test.mjs` (4 React render tests) |
| End-to-end | `weather-smoke.spec.js#renders the missing-data placeholder ...` (Playwright) |

## Reproducing the contract on demand

`?mock=missing` is a labelled portfolio demo route that serves a
local missing-data model and shows a runtime notice that live
providers are not queried:

```bash
npm run dev
open http://127.0.0.1:5173/?mock=missing
```

The current temperature stays real so the dashboard still looks
like a working forecast — the point is that every other field
degrades gracefully. CI uses the same labelled demo route to capture
the trust-contract screenshot as an artifact on every Playwright run.

A 6-test unit suite (`missingDataMock.test.mjs`) verifies that the
dev-only endpoint mock returns the expected null shapes for each
endpoint and forwards unknown URLs to the original fetch.

## Numbers

| | Before audit | After audit |
|---|---|---|
| Tests | 45 | **573** Node test-runner checks across 120 suites |
| Playwright checks | 12 | 34 (incl. missing-data + unicode-escape guards, axe-core on `/` *and* `?mock=missing`, cached offline restore, and app-shell offline reload) |
| `App.css` lines | 2,067 | 890 |
| Bundle (gzip) | ≈ 84 kB | ≈ 111 kB initial route (CSS + app + react-vendor); radar and Supabase load lazily |
| `useWeatherData` lines | 459 | 354 |
| `useSavedLocationsSync` lines | 360 | 273 |

## What this proves about the engineer

Most weather-app portfolio projects optimise for the happy path —
the dashboard looks great when every API response is perfect and
hides everything else. This work is the opposite: the trust contract
only matters when the data is partial, the network is slow, or a
sample is missing. Choosing to make those moments first-class is the
difference between a polished demo and a product worth shipping.

The deeper signal: **the contract is enforced where it cannot drift**.
A future contributor who adds a new card or a new metric automatically
inherits the strict-coercion contract because every helper they will
reach for already enforces it. The tests will fail before the
regression ships.

## Latest product pass

The next Aura pass made that trust story more visible in the day-to-day
product experience instead of leaving it buried in implementation notes:

- successful geolocation now upgrades from a generic "Current location"
  label into a friendly nearby place name via reverse geocoding
- the city picker now separates `Recent` switches from long-term `Saved`
  places, which makes the app feel more like a daily tool than a demo
- each daily forecast row now opens richer inline details for rain
  chance, UV, wind, and sunrise/sunset without adding charting weight
- the README now includes committed desktop/mobile screenshots plus a
  simple architecture diagram so hiring managers can parse the product
  and code story quickly

That is a useful interview signal on its own: the project is not just
"more features." It shows the ability to identify which changes make an
already-solid app easier to trust, easier to navigate, and easier to
evaluate as a piece of product engineering.

## Why six surfaces talk about rain

Three consecutive audits have raised the same question about Aura's
information architecture: six modules touch precipitation — the hourly
chart's precipitation tab, the radar, the nowcast, the rain outlook,
storm watch, and the weekly rain percentages — and a reviewer
optimising for "sharp" would merge some of them. The decision, made
deliberately and recorded here rather than left ambiguous: **keep all
six, because they answer six different questions on six different time
horizons.**

| Surface | Question it answers | Horizon |
|---|---|---|
| Nowcast | "Do I need an umbrella walking out the door?" | 0–2 hours |
| Hourly precipitation | "When does it start and stop today?" | 0–24 hours |
| Radar | "Is that band actually heading here?" | observed, now |
| Rain outlook | "How much water, and when does it peak?" | rest of today |
| Storm watch | "Could today turn severe?" | today, risk-weighted |
| Weekly rain chance | "Which day should I move the plan to?" | 7 days |

Collapsing the nowcast into the rain outlook — the merge most often
suggested — would force a 45-minute decision and a 24-hour accumulation
total to share one visual altitude, which is exactly the flattening the
hierarchy work went to some trouble to undo. The modules are ranked, not
merely stacked: severe alerts sit above everything, the hero carries the
day's decisions, near-term outlook precedes the ambient panels, and
diagnostics live behind a disclosure most users never open.

The honest counter-argument, kept here because it is a real trade-off:
breadth costs scroll length, and a reviewer who values editing over
coverage will read six rain surfaces as indecision no matter how well
ranked they are. The trigger to revisit is behavioural, not aesthetic —
if the nowcast and rain outlook were ever found to be read as
interchangeable rather than sequential, the merge becomes correct and
this section should be rewritten to say so.
