# `resolveTodayIndex` on a run-out daily series

**Status:** open — needs a decision before any code.
**Finding:** #2 of the run-out audit. #1 shipped as unit 8a, #3 and #4 as unit 8b.
**Written:** 2026-09-17, against `main` at `6da2927`.

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
