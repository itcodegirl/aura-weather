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
locked in by tests at every layer.

Then — three audits later — a fourth pass found three live violations
still inside it, including a forecast row that rendered a confident
"Clear" sky for a reading the provider never sent. That second half is
the more useful story, and it is written up below: how a contract leaks
when a module wraps the shared helper in a local one with different
semantics, why two panels reported two-day-old weather as live, and what
automated accessibility testing cannot see even when it passes clean.

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
| Strict helper | `numbers.test.mjs` (10 tests) |
| API normalization | `transforms.test.mjs` (7 tests) |
| Archive averaging | `openMeteo.test.mjs#fetchHistoricalTemperatureAverage` (2 tests) |
| Component fallback | `temperature.test.mjs` (8 tests) |
| Stat primitive | `Stat.render.test.mjs` (4 React render tests) |
| Hero card DOM | `HeroCard.render.test.mjs` (19 React render tests) |
| Forecast row DOM | `ForecastCard.render.test.mjs` — including a guard that a missing weather code never renders "Clear" |
| Storm synthesis | `StormWatch.render.test.mjs` — including a guard that stale leading CAPE never reaches the DOM |
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

A 7-test unit suite (`missingDataMock.test.mjs`) verifies that the
dev-only endpoint mock returns the expected null shapes for each
endpoint and forwards unknown URLs to the original fetch.

## Numbers

| | Before audit | After audit |
|---|---|---|
| Tests | 45 | **573** Node test-runner checks across 120 suites |
| Playwright checks | 12 | 34 (incl. missing-data + unicode-escape guards, axe-core on `/` *and* `?mock=missing` at WCAG 2.1 AA + 2.2 AA, cached offline restore, app-shell offline reload, and mutation-tested layout guards) |
| Visual baselines | 0 | 0 — added, then deliberately removed; see *What I removed* |
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

The deeper signal is not that the contract was written — it is what
happened afterwards. A contract enforced by a shared helper still leaked,
three separate times, because individual modules wrapped that helper in
local variants with looser semantics. Finding that required assuming the
system was already broken and hunting for the proof, rather than assuming
three prior green audits meant it was fine.

The habit that generalises: **reproduce the wrong output before changing
the code, and re-check the claim you are most confident about.** Twice in
this pass the confident claim was mine, and it was wrong. Both corrections
are recorded here rather than quietly fixed, because a case study that
only lists successes is a worse engineering signal than one that shows
how errors get caught.

## The contract was not enough

Three audits passed over Aura after the contract shipped. A fourth —
run as five parallel reviews, each hunting a different class of defect —
found three live fabrications still inside the very system built to
prevent them. That is the most useful thing this project has taught me,
so it belongs in the case study rather than a commit log.

**A forecast row claimed "Clear" for a reading that did not exist.**
`ForecastCard` defines a *local* `toFiniteNumber` wrapper that, unlike
the shared helper, accepts a fallback:

```js
function toFiniteNumber(value, fallback = NaN) {
  const parsed = toStrictFiniteNumber(value);
  return parsed === null ? fallback : parsed;
}
```

It was called as `toFiniteNumber(weatherCodes[index], 0)`. WMO code 0 is
"Clear". So an absent `daily.weather_code` rendered a confident amber sun
and the word *Clear* beside real temperatures — and if the API omitted
the field entirely, all seven rows did. `weatherCodes.js` carries a
comment warning against precisely this, written when the contract was
built. The comment was right and the call site ignored it.

**The wind tile invented gusts.** When `wind_gusts_10m` was missing it
fell back to the sustained speed, printing *"Gusts to 12 mph"* from
`wind_speed_10m`. The fallback concealed itself whenever both readings
were absent, which is likely why three audits walked past it.

**The hourly summary forecast no rain from no data.** `?? 0` behind a
guard keyed on temperature produced *"rain chance peaking at 0%"* when
the provider had sent no rain data at all.

The lesson is not "add more tests." It is that **a contract enforced by a
shared helper leaks the moment a module wraps that helper in a local one
with different semantics.** The shared function takes a single argument
on purpose; the wrapper took two, and the extra argument silently
reintroduced the exact bug class the project is named for. I only caught
my own misreading of this by running the wrapper's semantics in a
throwaway script instead of trusting a code read — which is how I learned
I had been wrong about it thirty minutes earlier.

## When "now" is not index zero

The forecast request carries `past_hours=48`, so hourly index 0 is two
days in the past. Four modules consume that series. Two anchored to the
current hour with a shared `findWindowStartIndex` helper. Two did not.

Storm Watch read `cape[0]`. On a calm day following a stormy one it could
headline **"Severe"**, fill a four-segment risk meter, and state *"Severe
storm risk from live storm energy"* using convective energy from 48 hours
earlier. The inverse also held: it could report "All clear" during a real
build-up. The hero had the same flaw in its imminent-rain scan, reading
indices 1 and 2 as "the next two hours" when they were 47 and 46 hours
*past* — and because the label prints time-of-day only, rain that fell the
day before yesterday surfaced as *"Rain likely around 3:00 pm — bring an
umbrella."* That branch also outranks the UV, gust and temperature
readings, so a false positive silenced them too.

Both are now anchored the way the other two modules always were. The
regression test for Storm Watch parks a deliberately alarming CAPE value
in the past slots and asserts it never reaches the DOM, so the stale read
cannot return quietly.

## What automated accessibility testing cannot see

axe-core runs in CI against both the live dashboard and the missing-data
state, and it passes clean. It also passed clean while every row of the
seven-day forecast hid its own data from screen readers.

The row trigger is a `<button>` carrying an `aria-label`. Per accessible-
name computation, `aria-label` on a button **replaces** its entire
subtree. So the label — *"Show forecast details for Wednesday"* —
discarded the day, condition, signal chip, high, low and rain chance.
A sighted user reads the week at a glance; a screen-reader user heard
seven identically-shaped prompts and had to expand every row, one at a
time, to learn a single temperature. No rule was violated. The markup was
valid. The information was simply gone.

Four more defects sat in the same blind spot: the hero's freshness pill
was a live region whose text embeds a five-minute clock bucket, so it
re-announced *"High confidence · 15 min ago"* every five minutes forever,
interrupting whatever the user was reading with no new information;
Escape in the city search blurred the input, dropping focus to `<body>`
so the next Tab restarted from the top of the document; the hourly
chart's 24 focusable columns announced times with no values while the
chart itself was `aria-hidden`; and the alert switches inverted their own
name as they toggled, giving two conflicting state cues at once.

**Automated accessibility testing proves the absence of known rule
violations. It cannot tell you whether the page makes sense read aloud.**

## The update that could never ship

`public/sw.js` is copied verbatim into the build, and `CACHE_VERSION` was
a hand-edited constant — moved three times in roughly two hundred commits.
Browsers decide whether to install a new service worker by byte-comparing
the file. Across almost every deploy it was identical, so `install` never
re-ran and `activate` never evicted the previous shell.

The user-visible consequence is the part worth noting. The app ships a
"New version available — refresh" banner, wired through
`watchInstallingWorker` and `notifyIfWaiting`. Both depend on a new worker
appearing. No new worker ever appeared, so **the banner could not fire —
the feature existed, was tested, and was unreachable.** A long-lived tab
or an installed PWA could sit on old JavaScript indefinitely, which is
exactly the case the banner was built for.

A build plugin now stamps the version from a hash of the emitted asset
filenames. It is verified in both directions: an unchanged rebuild
produces a byte-identical worker, so users are never nagged for a deploy
that changed nothing, and a change to shipped output produces a new one.

## What I removed, and what it cost

Not every improvement is an addition.

The project had Playwright visual-regression testing with five committed
baselines — a genuine differentiator, and advertised as such in the
README. Every intentional UI change required a download-review-commit
cycle against CI-rendered screenshots. When a one-line header change
triggered that cycle, the owner's call was to remove the system. I did,
including the README claims, so the repo would not advertise coverage it
no longer had.

That is a real reduction and the case study should say so plainly:
**nothing now catches an unintended layout shift.** What replaced part of
it is assertion-based — text-clipping checks at three viewports, a
hero-fits-the-phone guard, and an assertion that all eight atmosphere
tiles actually mount, since a late chunk once rendered the dashboard 749px
shorter with the bento simply absent and no test failed. Each new guard
was mutation-tested by injecting the defect it describes, because a green
test that cannot fail is worse than no test at all.

Separately, `ExposureSection` and `MetricCard` had been orphaned by the
bento redesign, but a barrel re-export kept 459 lines of their CSS on the
critical path for markup nothing rendered. Manrope was preloaded at the
highest priority and precached by the service worker, while sitting second
in every font stack behind an Inter face declared `font-weight: 100 900`
with no `unicode-range` — meaning it satisfies every glyph at every weight
and Manrope could never be selected. Both are gone.

## How I verify

Five parallel reviews produced more findings than any of them could
individually justify, and they were not uniformly right. Three examples,
because the failure modes matter as much as the successes:

- One reported the mobile-overflow assertion as tautological — unable to
  fail because `body` sets `overflow-x: hidden`. I injected a 900px
  element at a 390px viewport: the assertion failed exactly as intended.
  The claim was wrong and the test was left alone.
- One reported the fabricated "Clear" bug. I tested the *shared* helper,
  saw it ignore a second argument, and told the user the finding was
  wrong. It was not — the local wrapper honours the fallback. I
  re-verified by executing the wrapper's actual semantics, corrected the
  record, and shipped the fix with a regression test.
- One insisted two findings were unfixed after I had already merged them,
  because its view of the tree predated the commits.

The working rule that came out of it: **reproduce the wrong output before
changing code, and re-check the claim you are most confident about.** Every
fix in this pass was preceded by observing the defect. Findings that could
not be reproduced were discarded rather than implemented, and the ones
discarded are named in the pull requests so the reasoning survives.

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
