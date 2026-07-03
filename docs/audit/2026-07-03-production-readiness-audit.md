# Aura Weather — Production-Readiness Audit

**Date:** 2026-07-03
**Baseline:** `origin/main` @ `10a2303` (release **1.0.0**)
**Method:** Read-only review of the app shell, hooks, services, API adapters, domain
utilities, the Supabase rain-alerts backend (SQL migrations + Edge Function), and the
CI quality gates. Findings were produced by four independent review passes (data-trust /
correctness, accessibility / UX, performance / scale / resilience, and security / backend)
and cross-checked against the current source with `file:line` references. Every finding
below was verified against live code, not inferred.
**Lens:** Reviewed as a production app with real users — flagging anything that would show
wrong data, fail at scale, or create a bad experience, not only surface-level tickets.
**Scope of remediation:** Bugs and contract violations are fixed in surgical PRs (one
concern each). Subjective UI/IA changes and destructive/backend-deploy changes are
**escalated, not auto-applied**, per `AGENTS.md` ("Do not make subjective UI or visual
design decisions" / "What Not to Change Without Explicit Approval").

---

## 0. Headline

This is a genuinely well-engineered, honest codebase. There are **no Critical-severity
security, crash, or data-loss defects**: the Supabase RLS model is correct, secrets are
handled properly, the data-trust contract (`toFiniteNumber`, `"—"` placeholders, no fake
zeros) holds across the API/domain boundary, unit toggling does not refetch, stale caches
are labeled honestly, and the fetch layer's `requestId` + `AbortController` + `allSettled`
discipline prevents stale responses from overwriting fresh data. The previous
`docs/product-ux-audit.md` (2026-06-26) has largely been actioned — its top items are
**already fixed** in `1.0.0` (see §4).

The real, live exposure is narrower and sharper: a small cluster of **client-side unit
double-conversions and timezone bugs that render confidently-wrong labels**, a couple of
**robustness/scale rough edges**, and some **accessibility focus-order** and
**efficiency** gaps. Two backend hardening items and one privacy inconsistency are
escalated for your call.

---

## 1. Severity legend

| Severity | Meaning |
|---|---|
| **Critical** | Security hole, crash, or data-loss / corruption. **(none found)** |
| **High** | Visibly wrong data shown to users, silent failure, or a clear scale problem. |
| **Medium** | Correctness edge case, inconsistency, or efficiency issue on a common path. |
| **Low** | Latent trap, micro-inefficiency, or polish. |

---

## 2. Findings (live, ranked)

### Phase 1 — Confidently-wrong data (do first)

**F1 · [High] Hero comfort & wind chips double-convert units → wrong labels for every °C user**
`src/components/heroCard/buildHeroData.js:385,400`
The forecast is **always** fetched in Fahrenheit / mph (`useWeatherData.js:48`
`API_TEMPERATURE_UNIT = "fahrenheit"`, `:318` `getApiWindSpeedUnit() === "mph"`) and
converted client-side only for display. But `buildCharacteristicChips` re-converts the
already-°F dew point and already-mph wind by display unit before classifying:
```js
const dpF = unit === "C" ? dewPoint * 9 / 5 + 32 : dewPoint;   // :385 — dewPoint is already °F
const wMph = unit === "C" ? windSpeed * 0.621371 : windSpeed;  // :400 — windSpeed is already mph
```
For a °C user a real 52°F dew point becomes 125.6 → false **"Muggy"** on dry air; a real
30 mph wind becomes 18.6 → **"Breezy"** instead of **"Gusty"**. This is the exact
trust-contract violation ("do not fake certainty") the app exists to prevent — just via a
unit bug instead of a null coercion. The thresholds (`DEW_POINT_MUGGY_F`, `WIND_GUSTY_MPH`)
are defined in °F/mph, so classification must use the raw source value.
*Fix:* classify against the raw °F/mph value; the display unit is irrelevant to the label.
*Note (dead code found nearby):* `getApiTemperatureUnit(unit)` in `weatherUnits.js:35` has
**no call sites** — it is the unit-dependent fetch helper the buggy conversions seem to
assume exists. Worth deleting to remove the trap.

**F2 · [High] "Rain so far today" is summed against the device's midnight, not the location's**
`src/hooks/useRainAnalysis.js:112-122`
```js
const today = new Date();          // device local midnight
today.setHours(0, 0, 0, 0);
```
Open-Meteo hourly timestamps are location wall-clock (`timezone=auto`). Everywhere else
the app uses `getZonedNow(timeZone)` (Hourly, Nowcast, Hero), but `analyzeRain` receives no
timezone (`useRainAnalysis(hourly)` at `:152`). A viewer in Chicago looking at Tokyo gets
"so far today" and past-12/24/48h totals computed against the wrong day boundary — an
honest-looking number derived from the wrong day, on the app's headline rain feature.
*Fix:* thread `weather.meta.timezone` into `analyzeRain` and derive the day start from
`getZonedNow(timeZone)`.

**F3 · [Medium] Nowcast chart plots `0%` over missing probability slots → confident dry curve over gaps**
`src/components/nowcast/analyzeNowcast.js:128-130`
```js
const probabilitySeries = rows.map((row) => row.probability === null ? 0 : row.probability);
```
A slot with no provider probability is drawn at 0% — visually identical to a genuine dry
reading. The headline text stays honest (nulls filtered), only the plotted curve lies.
*Fix:* carry `null` through and gap the line at missing points.

### Phase 2 — Robustness & resilience

**F4 · [High] Saved-cities getters `localStorage.setItem` during a *read*, with no quota handling**
`src/hooks/useLocation.js:170-174,191-194`
`getSavedCities()`/`getRecentCities()` write a normalized value back whenever the stored
shape looks dirty — and they're called from `useState` initializers and from every
upsert/remove/move. A read that mutates storage can throw `QuotaExceededError` on a
render-time path, and the outer `catch` wipes the entire saved-cities list. This is the one
localStorage path lacking the quota handling the snapshot cache has.
*Fix:* make the getters pure; move normalization writes to an explicit migration path.

**F5 · [High] Auto-refresh effect tears down & reinstalls listeners + poll timer on every location change**
`src/hooks/useWeatherData.js:539-598`
The effect depends on `requestWeatherData`, which is recreated on every location change, so
the `online`/`visibilitychange` listeners and the 60s poll interval are re-registered and
the cadence reset on each city switch. Not a leak (cleanup runs), but needless churn.
*Fix:* hold `requestWeatherData` in a ref; depend only on `[backgroundRefreshEnabled, enabled]`.

**F6 · [Medium] `clampProbability` returns `0` for a non-finite input**
`src/components/nowcast/analyzeNowcast.js:9-12` — `Math.round(NaN)` → guard returns `0`, a
fake confident "0%". Not currently reachable (callers pre-validate) but a footgun that
contradicts the contract. *Fix:* return `null` for non-finite.

### Phase 3 — Accessibility

**F7 · [High] Hourly & Rain charts expose ~24 individually-tabbable bar buttons *plus* a duplicate control strip**
`src/components/HourlyCard.jsx:457-505`, `src/components/RainCard.jsx:394-467`
Each chart renders one focusable `<button>` per hour with no roving `tabindex`, and each
*also* renders a second per-hour strip below. A keyboard user traverses ~24 redundant tab
stops per view then the strip — the exact tab-explosion the roving strip elsewhere was
built to avoid (WCAG 2.4.3 / 2.1.1). *Fix:* apply the app's own roving-tabindex pattern to
one set and make the visual chart bars presentational (`aria-hidden`, non-focusable).

**F8 · [Medium] Conditional heading-level skip: severe-alert `<h3>` renders before the first `<h2>`**
`src/components/layout/WeatherDashboard.jsx:107-120` + `src/components/AlertsCard.jsx:95`
When an alert is active the outline is h1 → **h3** → h2 — the most urgent element is an
orphaned h3 (WCAG 1.3.1). *Fix:* make the alert card's title an `<h2>` (or give it an `<h2>`
group label like the other sections).

### Phase 4 — Efficiency & cleanup (Medium / Low)

- **F9 · [Medium]** Radar auto-play `setInterval` (`useRadarAnimation.js:54`) and the
  `AtmosphereParticles` CSS animation don't pause on `document.hidden`, unlike
  `useTimeNow`/`useRadarFrames` which do. Background tabs keep doing compositor/opacity work.
- **F10 · [Medium]** `RadarMap` mounts *every* frame as a live `TileLayer` with
  `updateWhenIdle={false}` (`RadarMap.jsx:123-140`) — ~15× tile bandwidth on a panel most
  users never scrub; heaviest cost on weak mobile networks.
- **F11 · [Medium]** `uvPanel` is fully computed (`buildHeroData.js:256-308`, returned `:558`)
  but `HeroCard` never destructures/renders it — dead compute + maintenance trap. Either
  render it or delete it (rendering placement is a **design call → escalated**).
- **F12 · [Medium]** Storm Watch still uses bespoke "Level N of 4" (`StormWatch.jsx:137`)
  instead of the shared `severity-badge` scale Nowcast now uses — inconsistent risk language.
- **F13 · [Low]** `getDateInTimeZone` returns `monthDay: undefined` on its success path
  (`openMeteo.js:189-240`); `formatSunClock` reads `Date.now()` inside a formatter
  (`sunlight.js:26`); `useRainAlerts` doesn't abort in-flight backend calls on location
  change (`useRainAlerts.js:90`); `RadarPanel` calls `matchMedia` per render (`RadarPanel.jsx:70`).

### Phase 5 — Backend hardening (ships alone; **not** auto-deployed to the live project)

**F14 · [Medium] Edge Function fails *open* when `CRON_SECRET` is unset**
`supabase/functions/check-rain-alerts/index.ts:148`
```js
if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return 403;
```
Deployed `verify_jwt=false`; if the secret is empty the auth check is skipped and the
endpoint is publicly triggerable (push spam, upstream API cost). *Fix:* fail closed — reject
when `CRON_SECRET` is unset.

**F15 · [Low] `Number(rule.min_probability) || 50` coerces a legitimate `0` threshold to the default**
`index.ts:84-85` — a user asking for "any rain" (threshold 0) silently gets 50. Same
`|| default` class as the client contract bans. *Fix:* use a finite check, not `||`.

---

## 3. Escalations — judgment calls, **not** auto-implemented

- **E1 · Privacy inconsistency (deeper problem).** Cloud Sync stores the user's saved
  locations — home/work coordinates — in a **public, unauthenticated jsonblob.com blob**
  (`src/services/savedLocationsSync.js`), protected only by an unguessable URL, on a
  third-party free service with no durability guarantee. Meanwhile the app already ships a
  properly **RLS-protected Supabase backend**. Storing sensitive location data with weaker
  guarantees than infrastructure you already run is the kind of ticket that reveals a
  strategy gap. Options: gate behind explicit opt-in with a clear privacy note; or migrate
  sync onto the existing Supabase/auth backend. Touches the persistence strategy → your call.
- **E2 · Information architecture / visual hierarchy.** The prior UX audit's "subtract
  redundant rain surfaces / sharpen hierarchy" items are subjective design decisions.
  `AGENTS.md` forbids me from making them solo, and per project memory the heavy rain
  coverage is **intentional**. Flagged as breadth-vs-sharpness, not a bug to cut.
- **E3 · Design placements.** Where/how to render `uvPanel` (F11), and the "My location"
  label-shifting / silent reverse-geocode fallback, need design direction, not a solo edit.
- **E4 · `AGENTS.md`.** A generic template was provided to "create" `AGENTS.md`, but a
  richer, code-accurate, itcodegirl-authored `AGENTS.md` already exists and is treated as
  authoritative. Overwriting it is destructive and unresolved — left untouched pending your
  decision.

---

## 4. Already strong / already fixed (verified in `1.0.0`)

- **Prior UX audit top items are fixed:** hero now renders `dailyGuidance`
  (`HeroCard.jsx:366`); the always-empty Moon tile is gone (8 real tiles,
  `AtmosphereBento.jsx:382`); the "High confidence" pill now downgrades on cached/stale data
  (`HeroCard.jsx:199`); Nowcast "rain likely" is 50% matching the rest of the app *and the
  backend* (`NowcastCard.jsx:17`); the "Risk Signals → Atmosphere" label mismatch is fixed.
- **Data-trust contract holds:** strict `toFiniteNumber` gate applied at every boundary;
  formatters degrade to `"—"` with `aria-label="No data available"`; unit toggle converts
  client-side (no refetch); stale caches labeled and age-gated; `requestId` + abort +
  `allSettled` prevent stale-overwrite and one dead provider blanking a panel.
- **Security posture is sound:** RLS scopes `push_subscriptions`/`alert_rules` to
  `auth.uid() = user_id`; `alert_deliveries` is service-role-only by design; the anon key is
  public-by-design; the Edge Function respects the trust contract (silent on missing data),
  dedupes via a unique constraint, and disables expired subscriptions.
- **Accessibility is past baseline:** correct ARIA 1.2 combobox, focus restoration on
  recovery, Escape-to-collapse returning focus to trigger, `prefers-reduced-motion` (CSS +
  JS), `aria-busy`/`role="switch"` wiring, no interactive `<div>`s, no bad `alt` text.
- **Resilience/scale discipline:** every timer/listener/RAF has a matching cleanup;
  localStorage is try/catch-wrapped with quota eviction in the snapshot cache;
  background-tab throttling on the clock and radar frames.

---

## 5. Remediation plan

Each item ships as its own branch/PR off `origin/main`, verified against the CI gate
(`npm run lint && npm test && npm run test:components && npm run build`, plus
`npm run test:e2e` / `test:visual` for UI-affecting changes), authored as `itcodegirl`,
hard-stopping at the open PR.

1. **Phase 1** — F1 (unit chips), F2 (rain-analysis tz), F3 (nowcast gaps).
2. **Phase 2** — F4 (getter write-on-read), F5 (listener churn), F6 (clampProbability).
3. **Phase 3** — F7 (chart focus order), F8 (alert heading level).
4. **Phase 4** — F9/F10 (radar & particle efficiency), F12 (severity scale), F13 (Low cluster). F11 pending E3.
5. **Phase 5** — F14/F15 backend: patched in-repo, but **not deployed** to the live Supabase
   project without an explicit go-ahead (touches auth/edge).
6. **Escalations E1–E4** — surfaced above; awaiting your decision, not auto-implemented.
