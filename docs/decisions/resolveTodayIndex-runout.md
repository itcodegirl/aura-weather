# `resolveTodayIndex` on a run-out daily series

**Status:** **decided — option B, implemented.**
**Finding:** #2 of the run-out audit. #1 shipped as unit 8a, #3 and #4 as unit 8b.
**Written:** 2026-09-17, against `main` at `6da2927`.
**Decided:** 2026-09-17 by Jenna Zawaski.

> ## The decision
>
> **Option B, with the `callerCoverage` gate.**
>
> - Run-out is `findIndex === -1` against the location's calendar date — the
>   series' own cadence, and nothing else. **No new threshold constant, and
>   deliberately not unified with `DEGRADED_SNAPSHOT_MAX_AGE_MS`:** snapshot
>   age and series run-out are different questions.
> - `resolveTodayIndex` returns `{ index: 0, status: "stale", staleByMs }`,
>   where `staleByMs` is now minus the last daily entry. The index stays 0, so
>   the panels cannot disagree about which day they show.
> - **`ForecastCard` does not join.** It keeps its own fallback.
> - Present-tense callers render "—" per the trust contract on `"stale"`:
>   `buildHeroData` high/low and `uvPanel`; `buildClimateComparison` → `null`;
>   `readUvOutlook` and `readRainOutlook` → `null`. Dated-row callers are
>   unchanged.
> - `callerCoverage.test.mjs` gains the matching gate, so a caller cannot land
>   without a decision recorded for it.
>
> Sections 3 and 4 below are the options as they were weighed, kept as the
> record of why B rather than A or C. Section 6 records what shipped.

---

## 1. What it does today

```js
// src/domain/forecastToday.js
const index = times.findIndex(
  (date) => typeof date === "string" && date.trim() >= todayIso
);

return index === -1 ? 0 : index;
```

`-1` means no daily entry is today or later — the whole series lies in the
past. The function answers `0`.

That is the same *shape* as the two defects already fixed: the failure
branch returns a real, in-range index, indistinguishable from a hit. Every
call site indexes `weather.daily.*` with it and has no way to ask whether it
was a hit.

It is not, however, the same *kind* of mistake. The trailing-index clamp in
`timeSeries.js` and the `Math.min(1, …)` in `sunlight.js` were both
accidents — nobody decided them, and neither docblock mentioned them. This
fallback is deliberate, argued for in its own docblock, and the argument is
a real one:

> Falls back to 0 when no entry is upcoming, which matches ForecastCard's own
> fallback (it renders every valid day when none are upcoming). A fully stale
> snapshot then keeps both panels on the same day instead of making them
> disagree in the other direction.

That is verifiable and still true:

```js
// src/components/ForecastCard.jsx
const upcomingDays = validDays.filter((day) => day.date.trim() >= todayIso);
return (upcomingDays.length > 0 ? upcomingDays : validDays).slice(0, 7);
```

So the two panels agree today. They agree on the wrong day, which is the
whole question.

## 2. What each call site shows

Six call sites, by grep rather than memory:

```
src/components/AtmosphereBento.jsx:512
src/components/heroCard/buildHeroData.js:561
src/components/heroCard/buildAtmosphereReading.js:97
src/hooks/climateComparison.js:32
src/domain/forecastNow.js:101   (readUvOutlook)
src/domain/forecastNow.js:162   (readRainOutlook)
```

Driven with a daily series dated `2026-04-21..23`, read at
`2026-09-17T17:00Z` — the five-month gap the repo's own e2e fixtures
carried until unit 7c. `resolveTodayIndex` answers `0`, i.e. `2026-04-21`.

| # | call site | what the reader is shown |
|---|---|---|
| 1 | `AtmosphereBento` (SunTile, UV tile) | April 21's sunrise/sunset times and UV peak, under a tile labelled "Today's sunrise and sunset for this location" |
| 2 | `buildHeroData` | `todayHighDisplay: 88°F`, `todayLowDisplay: 70°F`, `uvPanel: "Peak UV 9.4"` — and `today: "Thursday, September 17"` |
| 3 | `buildAtmosphereReading` | returns `null` here — its hourly scan fails first, so this one is already covered by unit 7c |
| 4 | `buildClimateComparison` | `todayHighTemperature: 88`, `difference: +14` against a 74°F 30-year average — an April heat spike reported as today's anomaly |
| 5 | `readUvOutlook` | `{ peak: 9.4, peakTime: "2026-04-21T00:00" }` |
| 6 | `readRainOutlook` | `{ source: "daily", chance: 95, amount: 1.4 }` → hero guidance "Bring rain gear — 95% peak chance today" |

The single line that states the problem best is from call site 2:

```
today            : Thursday, September 17
todayHighDisplay : 88°F
todayLowDisplay  : 70°F
```

The date label is read from the **clock**. The numbers under it are read
from the **series**. On a run-out snapshot the hero prints April's weather
with September's date on it — not stale data shown as stale, but a specific
false claim about a specific named day.

Note what is *not* on that list: nothing here is a silent-wrong-index bug in
the 7c sense, because index 0 is a genuine day's data. The failure is that
the app asserts it is *this* day's.

## 3. Options

### A. Fail closed — return a status, callers drop their surfaces

Mirror units 7c/8a/8b: return `{ index, status, staleByMs }` with
`index: -1` on run-out. Each call site drops or blanks its reading.

- **Fixes:** every row in the table above. No surface can claim a day it
  cannot place.
- **Breaks hero/Week-Ahead consistency in the other direction:** the hero
  empties out while `ForecastCard` keeps rendering its seven rows, because
  `ForecastCard` has its own independent fallback. That is precisely the
  two-panels-disagree defect `resolveTodayIndex` was written to close
  (audit finding A-05), reopened from the other side.
- **Cost:** six call sites plus `ForecastCard`'s fallback, or the
  disagreement is real. Largest change of the three.
- **Risk:** an over-broad guard empties the app on a snapshot that is merely
  a day old, which is a state the degraded-snapshot path deliberately
  supports.

### B. Partial — keep the index, add a status the callers may consult

Return `{ index: 0, status: "stale", staleByMs }`. Callers that make a
**present-tense claim about today** (the hero's high/low, the UV panel, the
climate anomaly, the rain guidance) check `status` and degrade. Callers that
merely display a dated row do not.

- **Fixes:** the same rows, at the point where the claim is made rather than
  at the lookup.
- **Preserves consistency:** both panels still draw from index 0, so they
  cannot disagree about *which* day. What changes is that the hero stops
  calling it today.
- **Cost:** the lookup change is small; the judgement is per call site, and
  six of them need a decision each.
- **Risk:** a status nobody is obliged to read is a status that gets
  skipped — the same failure family as an uncovered caller. Needs a
  `callerCoverage`-style gate to be safe.

### C. Keep `0`, fix the label instead

Leave the lookup alone. Make the surfaces that print a *date* read it from
the series they actually used, so `today` says "Tuesday, April 21" rather
than "Thursday, September 17".

- **Fixes:** the false claim, by making the claim true. The reader sees a
  coherent April 21 forecast and a last-updated footer five months old.
- **Preserves consistency:** completely; nothing about index selection moves.
- **Cost:** smallest. One or two label sites.
- **Risk:** it depends on the reader noticing the date, which the trust
  contract elsewhere in this repo explicitly refuses to rely on — missing
  data renders as "—", not as a plausible number with a caveat nearby. It
  also leaves `buildClimateComparison` wrong regardless: "+14°F above
  average" is a claim about an anomaly, not about a day, and relabelling the
  card does not make it true.

## 4. Recommendation

**B, with the gate.**

A is the purest and is what the trust contract implies, but it reopens the
exact defect this function exists to prevent, and it does so on the degraded
snapshot path — the one the app is *designed* to keep serving. Fixing that
properly means teaching `ForecastCard` the same staleness signal, at which
point the change is no longer six call sites but the whole daily path. That
is a unit of its own, not a follow-on.

C is cheapest and is genuinely better than today, but it cannot carry
`buildClimateComparison`, and it asks the reader to do the work that
"missing renders as —" exists to spare them.

B splits the difference honestly: one source of truth for *which* day
(unchanged, so the panels cannot disagree), and an explicit signal for
*whether it is today* that each present-tense surface must answer for. The
per-caller judgement is the cost, and the `callerCoverage.test.mjs` pattern
from unit 7c already exists to stop a caller landing without one.

Two things to settle before any code:

1. **What counts as run-out.** 8a and 8b both used the series' own cadence —
   an hour for hourly, a day for daily. The daily analogue is clean, but the
   app already has `DEGRADED_SNAPSHOT_MAX_AGE_MS` in `useWeatherData.js`,
   and two different staleness bounds in one app is its own drift risk.
2. **Whether `ForecastCard` joins.** Under B it does not have to. If the
   answer is that it should, this becomes option A and a larger unit.

## 5. Not decided here

`formatSunClock` has a `maxFutureDays` bound and no past bound at all, so it
will format a five-month-old sunrise without comment. Its only caller
(`ForecastCard`) labels every row with that row's own date, so it is not
making a present-tense claim, and it is not part of this finding. Recorded
so the next audit does not have to rediscover it.

---

## 6. What shipped

Implemented as written above. Two details worth recording, because both were
decided at the keyboard rather than in section 3:

**`unknown` is a third status, and is not `stale`.** `resolveTodayIndex` has
two pre-existing early returns — no usable daily dates, and no usable clock —
that also answered `0`. Neither is a run-out series. HeroCard passes
`nowMs: null` until `useTimeNow` resolves, which is a real first-paint state,
so collapsing it into `stale` would blank the hero on every first paint: a
different failure, not a fix. They answer `unknown`, and every caller treats
`unknown` exactly as it behaved before.

**The two readers return `null`, not an object of nulls.** Unit 7c argued the
opposite way for `resolveWindowStart`, and the difference is the consumers.
Every guard there was `if (index < 0)`, and `null < 0` is false, so `null`
would have sailed through silently. Every consumer of `readUvOutlook` and
`readRainOutlook` instead reaches straight for a field, so `null` throws on
the first read. In both cases the choice is whichever value makes an
unconverted caller break loudly. A test asserts the throw.

Four consumers needed a guard for that: the two `readUvOutlook(...).now` reads
in `buildHeroData` and `buildAtmosphereReading`, `UvTile`'s `outlook.now`, and
`buildRainGuidance`'s destructure — which already had a "Guidance unavailable"
branch for absent precipitation data, so a run-out series now lands there.

**Measured, before and after.** Series `2026-04-21..23`, read `2026-09-17T17:00Z`:

| surface | before | after |
|---|---|---|
| `resolveTodayIndex` | `0` | `{index: 0, status: "stale", staleByMs: 12744000000}` |
| hero high / low | `88°F` / `70°F` | `—` / `—` |
| hero `uvPanel` | "Very high UV today — protect your skin midday." | `null` |
| hero date label | "Thursday, September 17" | unchanged — it was the honest half |
| hero rain guidance | "Bring rain gear — 95% peak chance today" | "Guidance unavailable" |
| `buildClimateComparison` | high 88, **+14** vs average | `null` |
| `readUvOutlook` | `{now: null, peak: 9.4, peakTime: "2026-04-21T00:00"}` | `null` |
| `readRainOutlook` | `{source: "daily", chance: 95, amount: 1.4}` | `null` |
| AtmosphereBento UV tile | peak 8.1 rendered | "Unavailable" |
| AtmosphereBento sun tile | index 0 times | unchanged, by decision |

A control on `2026-09-17..19` is identical before and after on every row.

## 7. Still open

The sun tile keeps rendering the run-out day's sunrise and sunset under a
help string that reads "Today's sunrise and sunset for this location". That is
the decision — index 0 keeps this panel and the Week Ahead on the same day —
but the tile's own wording still says "today" about a day that is not. Unit 8b
already withholds the sun bead there (`getDaylightProgress` answers `null`), so
the arc is empty beside two live-looking times. Wording, not indexing; not in
this unit's scope.
