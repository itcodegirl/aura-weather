import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveWindowStart } from "./timeSeries.js";
import { analyzeNowcast } from "../components/nowcast/analyzeNowcast.js";
import { analyzeRain } from "../hooks/useRainAnalysis.js";
import { buildAtmosphereReading } from "../components/heroCard/buildAtmosphereReading.js";
import {
  resolveCurrentHourIndex,
  readRainOutlook,
  readUvOutlook,
} from "../domain/forecastNow.js";

/*
 * What a series that has entirely run out is allowed to say: nothing, in the
 * present tense.
 *
 * `resolveWindowStart` — `findWindowStartIndex` until this change — used to
 * answer a series whose every slot lies in the past by CLAMPING to the
 * trailing window: a real index, pointing at the tail, indistinguishable
 * from a hit. Every caller's guard is
 * `if (index < 0) { …say we do not know… }`, so none of them ever fired. The
 * tail was read as "now" and rendered as now.
 *
 * The nowcast is the clearest case, because its copy is explicitly
 * present-tense. Measured on the old behaviour, an eight-slot series whose
 * last reading was 48 hours old:
 *
 *   "Heavy rain likely now, lasting through most of the window"
 *
 * That is not stale data shown as stale. It is a two-day-old model run
 * asserting, in the present tense, that it is raining.
 *
 * ── Why these tests, and why here ─────────────────────────────────────────
 *
 * The behaviour belongs to `timeSeries.js`, but the DAMAGE belongs to its
 * callers, and a unit test on the helper alone would not have caught this:
 * the helper did exactly what its name and its own tests said. So this file
 * drives each consumer that reaches provider timestamps through the helper
 * and asserts on what a reader would see.
 *
 * Six production call sites, enumerated by grep rather than memory
 * (`grep -rn "resolveWindowStart(" src/ --include=*.js --include=*.jsx`):
 *
 *   1. components/nowcast/analyzeNowcast.js   the nowcast summary
 *   2. components/StormWatch.jsx              live storm energy (CAPE)
 *   3. components/HourlyCard.jsx              the "Now" marker
 *   4. components/heroCard/buildAtmosphereReading.js  imminent-rain scan
 *   5. hooks/useRainAnalysis.js               the rain window
 *   6. domain/forecastNow.js                  rain and UV "right now" readers
 *
 * Four are pure and are driven here. The two React components are driven in
 * their own render suites (StormWatch.render.test.mjs, HourlyCard.render.test.mjs),
 * because their calls sit inside component bodies rather than exported functions.
 * `src/utils/callerCoverage.test.mjs` asserts that this list still matches the
 * grep, so a seventh caller cannot land uncovered.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * How stale a replayed snapshot can be, read from its real home rather than
 * copied. If the degraded window ever widens, these fixtures widen with it.
 */
function degradedMaxAgeMs() {
  const source = readFileSync(
    fileURLToPath(new URL("../hooks/useWeatherData.js", import.meta.url)),
    "utf8"
  );
  const match =
    /const DEGRADED_SNAPSHOT_MAX_AGE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000\s*;/.exec(
      source
    );
  assert.ok(
    match,
    "DEGRADED_SNAPSHOT_MAX_AGE_MS moved or was renamed in useWeatherData.js"
  );
  return Number(match[1]) * HOUR_MS;
}

const STALE_BY_MS = degradedMaxAgeMs();
const NOW = Date.UTC(2026, 8, 17, 17, 0);
const TZ = "UTC";

/** A naive local timestamp, the shape the provider actually sends. */
function naive(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 16);
}

/** `count` slots of `stepMs`, the last of which ends `STALE_BY_MS` before now. */
function expiredSeries(count, stepMs) {
  const lastSlot = NOW - STALE_BY_MS;
  return Array.from({ length: count }, (_, i) =>
    naive(lastSlot - (count - 1 - i) * stepMs)
  );
}

/** The same shape, still live: the last slot is ahead of now. */
function liveSeries(count, stepMs) {
  return Array.from({ length: count }, (_, i) => naive(NOW + i * stepMs));
}

describe("a series that has run out says so", () => {
  describe("the fixtures are what they claim", () => {
    test("the expired series really does end before now", () => {
      // Positive control on the fixture itself. Every assertion below is
      // meaningless if the series is not actually in the past.
      const series = expiredSeries(8, 15 * MINUTE_MS);
      assert.ok(Date.parse(`${series.at(-1)}Z`) < NOW);
      assert.equal(NOW - Date.parse(`${series.at(-1)}Z`), STALE_BY_MS);
      assert.ok(STALE_BY_MS >= 24 * HOUR_MS, "a stale fixture under a day is not the case at issue");
    });

    test("the live series really does reach past now", () => {
      const series = liveSeries(8, 15 * MINUTE_MS);
      assert.ok(Date.parse(`${series.at(-1)}Z`) > NOW);
    });
  });

  describe("the helper itself", () => {
    test("reports past-the-end rather than pointing at the tail", () => {
      const result = resolveWindowStart(expiredSeries(8, 15 * MINUTE_MS), {
        now: NOW,
        timeZone: TZ,
      });
      // Whatever shape the signal takes, what it must NOT be is a usable
      // index into the series.
      const index = typeof result === "number" ? result : result?.index;
      assert.ok(
        index === undefined || index < 0,
        `expected no usable index for an expired series, got ${JSON.stringify(result)}`
      );
    });

    test("a live series is unaffected", () => {
      // The control that stops this being fixed by making the helper
      // useless. Normal operation must be untouched.
      const result = resolveWindowStart(liveSeries(8, 15 * MINUTE_MS), {
        now: NOW,
        timeZone: TZ,
      });
      const index = typeof result === "number" ? result : result?.index;
      assert.equal(index, 0);
    });

    test("an empty or unusable series is still reported", () => {
      for (const input of [[], ["bad", "", null]]) {
        const result = resolveWindowStart(input, { now: NOW, timeZone: TZ });
        const index = typeof result === "number" ? result : result?.index;
        assert.ok(index === undefined || index < 0);
      }
    });
  });

  describe("1. the nowcast summary", () => {
    const expired = {
      time: expiredSeries(8, 15 * MINUTE_MS),
      rainChance: Array(8).fill(95),
      rainAmount: Array(8).fill(0.3),
      conditionCode: Array(8).fill(65),
    };

    test("does not claim rain is falling now", () => {
      const result = analyzeNowcast(expired, { timeZone: TZ, now: NOW });

      assert.equal(result.hasData, false);
      assert.equal(result.hasRain, false);
      assert.equal(result.peakProbability, null);
      // The exact string the old behaviour produced, and the shape of it.
      assert.doesNotMatch(
        result.summary,
        /likely now|rain likely|lasting/i,
        `the nowcast spoke in the present tense from an expired series: ${result.summary}`
      );
    });

    test("a live series still reads the rain", () => {
      const live = { ...expired, time: liveSeries(8, 15 * MINUTE_MS) };
      const result = analyzeNowcast(live, { timeZone: TZ, now: NOW });
      assert.equal(result.hasData, true);
      assert.equal(result.hasRain, true);
    });
  });

  describe("4. the hero's imminent-rain scan", () => {
    function weatherWith(time) {
      return {
        current: { temperature: 68, conditionCode: 2, humidity: 55, dewPoint: 52 },
        hourly: {
          time,
          rainChance: Array(time.length).fill(95),
          rainAmount: Array(time.length).fill(0.3),
          temperature: Array(time.length).fill(68),
          uvIndex: Array(time.length).fill(2),
        },
        daily: { time: ["2026-09-17"], uvIndexMax: [6], sunrise: [], sunset: [] },
        meta: { timezone: TZ },
      };
    }

    test("does not announce rain from an expired series", () => {
      const reading = buildAtmosphereReading({
        weather: weatherWith(expiredSeries(6, HOUR_MS)),
        nowMs: NOW,
        unit: "F",
      });
      const text = JSON.stringify(reading ?? {});
      assert.doesNotMatch(
        text,
        /rain (starts|arrives|likely)|showers? (start|arrive)/i,
        `the hero announced imminent rain from an expired series: ${text}`
      );
    });
  });

  describe("5. the rain window", () => {
    test("returns no analysis for an expired series", () => {
      const expired = {
        time: expiredSeries(24, HOUR_MS),
        rainChance: Array(24).fill(95),
        rainAmount: Array(24).fill(0.3),
      };
      const result = analyzeRain(expired, TZ, NOW);

      assert.equal(result.hasData, false);
      assert.equal(result.nextRain ?? null, null);
    });

    test("a live series still analyses", () => {
      const live = {
        time: liveSeries(24, HOUR_MS),
        rainChance: Array(24).fill(95),
        rainAmount: Array(24).fill(0.3),
      };
      assert.equal(analyzeRain(live, TZ, NOW).hasData, true);
    });
  });

  describe("6. the rain and UV 'right now' readers", () => {
    function weatherWith(time) {
      return {
        hourly: {
          time,
          rainChance: Array(time.length).fill(95),
          rainAmount: Array(time.length).fill(0.3),
          uvIndex: Array(time.length).fill(9),
        },
        daily: {
          time: ["2026-09-17"],
          uvIndexMax: [9],
          rainChanceMax: [95],
          rainAmountTotal: [1.2],
        },
        meta: { timezone: TZ },
      };
    }

    test("resolveCurrentHourIndex reports no current hour", () => {
      // This one already guarded itself against the clamp with a local
      // tolerance check. It must keep working, and for the right reason.
      assert.equal(
        resolveCurrentHourIndex(weatherWith(expiredSeries(24, HOUR_MS)), NOW),
        -1
      );
    });

    test("the UV reader does not report a live index", () => {
      const outlook = readUvOutlook(weatherWith(expiredSeries(24, HOUR_MS)), NOW);
      assert.equal(outlook.now, null);
    });

    test("the rain reader falls back off the hourly series", () => {
      const outlook = readRainOutlook(weatherWith(expiredSeries(24, HOUR_MS)), NOW);
      assert.notEqual(
        outlook.source,
        "hourly",
        "an expired hourly series must not be the source of a 'rest of today' claim"
      );
    });

    test("a live series still reads as hourly", () => {
      const outlook = readRainOutlook(weatherWith(liveSeries(24, HOUR_MS)), NOW);
      assert.equal(outlook.source, "hourly");
    });
  });
});
