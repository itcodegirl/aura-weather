import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveTodayIndex } from "./forecastToday.js";
import { readRainOutlook, readUvOutlook } from "./forecastNow.js";
import { buildHeroData } from "../components/heroCard/buildHeroData.js";
import { buildAtmosphereReading } from "../components/heroCard/buildAtmosphereReading.js";
import { buildClimateComparison } from "../hooks/climateComparison.js";

/*
 * What a DAILY series that has entirely run out is allowed to say: nothing,
 * in the present tense.
 *
 * `resolveTodayIndex` answers 0 when no daily entry is today or later. The
 * index is deliberately kept — it matches ForecastCard's own fallback, so the
 * hero and the Week Ahead cannot disagree about which day they show — but 0
 * is a real, in-range index, and for six call sites it was indistinguishable
 * from a hit.
 *
 * Measured on a series dated 2026-04-21 read on 2026-09-17, the hero printed
 * a date read from the CLOCK over numbers read from the SERIES:
 *
 *   today            : Thursday, September 17
 *   todayHighDisplay : 88°F
 *
 * and the climate card called it "+14°F above the 30-year average for this
 * date". Not stale data shown as stale — a specific false claim about a
 * specific named day.
 *
 * ── The decision these tests encode ───────────────────────────────────────
 *
 * Option B of `docs/decisions/resolveTodayIndex-runout.md`: one source of
 * truth for WHICH day (the index, unchanged), and an explicit `status` for
 * WHETHER IT IS TODAY that each present-tense surface must answer for.
 *
 * Six production call sites, enumerated by grep rather than memory
 * (`grep -rn "resolveTodayIndex(" src/ --include=*.js --include=*.jsx`):
 *
 *   1. components/heroCard/buildHeroData.js        high/low + the UV panel
 *   2. components/heroCard/buildAtmosphereReading.js  the hero reading line
 *   3. hooks/climateComparison.js                  the 30-year anomaly
 *   4. domain/forecastNow.js  (x2)                 the UV and rain readers
 *   5. components/AtmosphereBento.jsx              the UV and sun tiles
 *
 * Five are driven here. AtmosphereBento is a component and is driven in its
 * own render suite. `src/utils/callerCoverage.test.mjs` asserts this list
 * still matches the grep, so a seventh caller cannot land without a decision.
 */

const TZ = "America/Chicago";
const NOW = Date.parse("2026-09-17T17:00:00Z");
const RUN_OUT_DAYS = ["2026-04-21", "2026-04-22", "2026-04-23"];
const LIVE_DAYS = ["2026-09-17", "2026-09-18", "2026-09-19"];

function weatherFor(days) {
  return {
    meta: { timezone: TZ },
    current: {
      temperature: 67.4, humidity: 58, feelsLike: 68, conditionCode: 2,
      windSpeed: 9.8, windGust: 14.2, windDirection: 220, pressure: 1014,
      dewPoint: 52, cloudCover: 34, visibility: 12000, uvIndex: 3,
    },
    hourly: {
      time: Array.from(
        { length: 24 },
        (_, h) => `${days[0]}T${String(h).padStart(2, "0")}:00`
      ),
      uvIndex: Array(24).fill(2),
      rainChance: Array(24).fill(90),
      rainAmount: Array(24).fill(0.4),
      pressure: Array(24).fill(1014),
    },
    daily: {
      time: days,
      temperatureMax: [88, 61, 62],
      temperatureMin: [70, 44, 45],
      uvIndexMax: [9.4, 2.1, 2.2],
      sunrise: days.map((d) => `${d}T06:18:00-05:00`),
      sunset: days.map((d) => `${d}T19:42:00-05:00`),
      rainChanceMax: [95, 10, 10],
      rainAmountTotal: [1.4, 0, 0],
      weatherCode: [95, 1, 1],
    },
  };
}

const runOut = () => weatherFor(RUN_OUT_DAYS);
const live = () => weatherFor(LIVE_DAYS);
const hero = (weather) =>
  buildHeroData({ weather, location: { name: "Chicago" }, unit: "F", nowMs: NOW });

describe("a daily series that has run out says so", () => {
  describe("the fixtures are what they claim", () => {
    test("the run-out series really has no entry at or after today", () => {
      // Positive control on the fixture. Every assertion below is meaningless
      // if the series is not actually behind the clock.
      const resolved = resolveTodayIndex(runOut(), NOW);
      assert.equal(resolved.status, "stale");
      assert.ok(
        resolved.staleByMs > 120 * 24 * 60 * 60 * 1000,
        "a stale fixture under four months is not the case at issue"
      );
    });

    test("the live series really does reach today", () => {
      assert.equal(resolveTodayIndex(live(), NOW).status, "ok");
    });

    test("the index is still 0 either way, so the panels cannot disagree", () => {
      // The part of the old behaviour that is deliberately KEPT. If this ever
      // returns -1, ForecastCard and the hero start showing different days.
      assert.equal(resolveTodayIndex(runOut(), NOW).index, 0);
      assert.equal(resolveTodayIndex(live(), NOW).index, 0);
    });
  });

  describe("1. the hero's high, low and UV panel", () => {
    test("renders the missing placeholder, not the stale day's readings", () => {
      const data = hero(runOut());
      assert.equal(data.todayHighDisplay, "—");
      assert.equal(data.todayLowDisplay, "—");
      assert.equal(data.uvPanel, null);
    });

    test("keeps its date label, which was never the dishonest half", () => {
      // The label is read from the clock and is correct. It is what made the
      // readings beside it a claim about today rather than about April.
      assert.match(hero(runOut()).today, /September 17/);
    });

    test("a live series still renders all three", () => {
      const data = hero(live());
      assert.equal(data.todayHighDisplay, "88°F");
      assert.equal(data.todayLowDisplay, "70°F");
      assert.equal(data.uvPanel.peak, 9.4);
    });
  });

  describe("2. the hero's reading line", () => {
    test("stays null on a run-out series", () => {
      // Decided unchanged: this surface already answered null, because its
      // hourly scan (resolveWindowStart, unit 7c) fails before the daily
      // index is ever read. Pinned so that stays true rather than luck.
      assert.equal(buildAtmosphereReading({ weather: runOut(), nowMs: NOW, unit: "F" }), null);
    });

    test("a live series still produces a reading", () => {
      const reading = buildAtmosphereReading({ weather: live(), nowMs: NOW, unit: "F" });
      assert.ok(reading?.text, "expected a reading line on a live series");
    });
  });

  describe("3. the 30-year climate anomaly", () => {
    test("returns null rather than comparing an April high to today's average", () => {
      // The one surface a date label cannot rescue: "+14°F above average for
      // this date" is a claim about an anomaly, not about a day, so there is
      // nothing honest to render.
      assert.equal(
        buildClimateComparison(runOut(), { averageHighTemperature: 74 }, NOW),
        null
      );
    });

    test("a live series still compares", () => {
      const comparison = buildClimateComparison(live(), { averageHighTemperature: 74 }, NOW);
      assert.equal(comparison.todayHighTemperature, 88);
      assert.equal(comparison.difference, 14);
    });
  });

  describe("4. the UV and rain 'today' readers", () => {
    test("both answer null", () => {
      assert.equal(readUvOutlook(runOut(), NOW), null);
      assert.equal(readRainOutlook(runOut(), NOW), null);
    });

    test("null rather than an object of nulls, so a missed caller throws", () => {
      // Every consumer reaches straight for a field. An object of nulls would
      // let an unconverted one render nothing silently — the same failure
      // family as the bug. This one breaks on the first read instead.
      assert.throws(() => readUvOutlook(runOut(), NOW).now, TypeError);
    });

    test("a live series still reads", () => {
      assert.equal(readUvOutlook(live(), NOW).peak, 9.4);
      assert.equal(readRainOutlook(live(), NOW).source, "hourly");
    });
  });

  describe("the hero's rain guidance, which reads through those readers", () => {
    test("falls to the same 'unavailable' branch absent data has always used", () => {
      const rain = hero(runOut()).dailyGuidance.find((g) => g.kind === "rain");
      assert.equal(rain.tone, "unavailable");
      assert.equal(rain.value, "Guidance unavailable");
    });

    test("a live series still advises", () => {
      const rain = hero(live()).dailyGuidance.find((g) => g.kind === "rain");
      assert.equal(rain.value, "Bring rain gear");
    });
  });
});
