import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fetchWeather } from "./openMeteo.js";

/*
 * The forecast request must ask for the hours the app reads, and no more.
 *
 * Before `forecast_hours` existed the request asked for 432 hourly slots and
 * the app read at most 72 of them. `forecast_days=7` looked like the bound and
 * was not: with `past_hours` set, Open-Meteo returned its full sixteen-day
 * hourly horizon regardless. Measured for Palos Hills on 2026-09-17 —
 * 2026-09-15T12:00 -> 2026-10-03T11:00, 60,472 bytes, of which the hourly
 * block was 34,287.
 *
 * Trimming it introduces the opposite failure, which is the one worth gating:
 * ask for too FEW forward hours and a restored snapshot renders a short hourly
 * card, or an empty one. Three numbers decide that, and they live in three
 * different layers:
 *
 *   forecast_hours              openMeteo.js       (this layer)
 *   WINDOW                      HourlyCard.jsx     (hours rendered)
 *   DEGRADED_SNAPSHOT_MAX_AGE_MS useWeatherData.js (oldest snapshot replayed)
 *
 * The layer rules stop `api/` importing either of the other two, so this reads
 * them out of their real files. A source-reading gate is only as good as its
 * regexes, so every one of them is exercised on synthetic input first: a
 * pattern that silently stops matching would otherwise report agreement
 * forever, which is the failure mode this whole file exists to prevent.
 */

const HOUR_MS = 60 * 60 * 1000;

const SOURCES = {
  openMeteo: "./openMeteo.js",
  hourlyCard: "../components/HourlyCard.jsx",
  weatherData: "../hooks/useWeatherData.js",
  rainAnalysis: "../hooks/useRainAnalysis.js",
};

function read(key) {
  return readFileSync(fileURLToPath(new URL(SOURCES[key], import.meta.url)), "utf8");
}

const PATTERNS = {
  forecastHours: /const FORECAST_HOURS\s*=\s*(\d+)\s*;/,
  pastHours: /const PAST_HOURS\s*=\s*(\d+)\s*;/,
  renderWindow: /const WINDOW\s*=\s*(\d+)\s*;/,
  degradedMaxAge:
    /const DEGRADED_SNAPSHOT_MAX_AGE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000\s*;/,
  rainWindow: /windowSize:\s*(\d+)\s*,/,
};

/**
 * The integer `pattern` captures in `source`, or a failure naming the file.
 *
 * Throwing rather than returning null is deliberate: a renamed constant must
 * break this suite loudly, not quietly drop out of the comparison.
 */
function readNumber(source, patternKey, label) {
  const match = PATTERNS[patternKey].exec(source);
  assert.ok(
    match,
    `${label} no longer matches ${PATTERNS[patternKey]} — the constant moved or was renamed, so this gate cannot see it`
  );
  return Number(match[1]);
}

describe("the forecast request covers what the app reads", () => {
  describe("the detectors work", () => {
    // Positive controls. Each pattern is proved to match the shape it is
    // aimed at and to reject a near miss, so "everything agrees" cannot come
    // from a regex that matches nothing.
    test("each pattern finds its constant in a representative line", () => {
      assert.equal(readNumber("const FORECAST_HOURS = 72;", "forecastHours", "x"), 72);
      assert.equal(readNumber("const PAST_HOURS = 48;", "pastHours", "x"), 48);
      assert.equal(
        readNumber("const WINDOW = 24; // hours rendered", "renderWindow", "x"),
        24
      );
      assert.equal(
        readNumber(
          "const DEGRADED_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;",
          "degradedMaxAge",
          "x"
        ),
        48
      );
      assert.equal(
        readNumber("  const idx = findWindowStartIndex(t, {\n windowSize: 24,\n });", "rainWindow", "x"),
        24
      );
    });

    test("a renamed constant fails rather than passing quietly", () => {
      assert.throws(
        () => readNumber("const FORECAST_WINDOW = 72;", "forecastHours", "openMeteo.js"),
        /openMeteo\.js no longer matches/
      );
      assert.throws(
        () => readNumber("const MAX_AGE_MS = 48 * 60 * 60 * 1000;", "degradedMaxAge", "useWeatherData.js"),
        /useWeatherData\.js no longer matches/
      );
    });
  });

  describe("the numbers agree across the three layers", () => {
    const forecastHours = readNumber(read("openMeteo"), "forecastHours", "openMeteo.js");
    const pastHours = readNumber(read("openMeteo"), "pastHours", "openMeteo.js");
    const renderWindow = readNumber(read("hourlyCard"), "renderWindow", "HourlyCard.jsx");
    const degradedMaxAgeHours = readNumber(
      read("weatherData"),
      "degradedMaxAge",
      "useWeatherData.js"
    );
    const rainWindow = readNumber(read("rainAnalysis"), "rainWindow", "useRainAnalysis.js");

    test("the forward horizon survives the oldest snapshot the app will replay", () => {
      // A snapshot `degradedMaxAgeHours` old has that many forward slots
      // already behind it. What is left must still fill the hourly card.
      const needed = renderWindow + degradedMaxAgeHours;
      assert.ok(
        forecastHours >= needed,
        `forecast_hours=${forecastHours} leaves a ${degradedMaxAgeHours}h-old snapshot only ` +
          `${forecastHours - degradedMaxAgeHours}h forward, but HourlyCard renders ${renderWindow}h. ` +
          `Ask for at least ${needed}.`
      );
    });

    test("the forward horizon also covers the rain analysis window", () => {
      const needed = rainWindow + degradedMaxAgeHours;
      assert.ok(
        forecastHours >= needed,
        `forecast_hours=${forecastHours} is short of analyzeRain's ${rainWindow}h window ` +
          `after a ${degradedMaxAgeHours}h replay; ask for at least ${needed}.`
      );
    });

    test("the backward horizon covers the deepest lookback", () => {
      // analyzeRain totals rainfall from the location's own midnight, so the
      // worst case is a reading taken at 23:59 local: 24 hours back. The
      // pressure trend's 6-hour baseline sits well inside that.
      assert.ok(
        pastHours >= 24,
        `past_hours=${pastHours} cannot reach the location's midnight, which analyzeRain sums from`
      );
    });

    test("the horizon is trimmed, not merely re-stated", () => {
      // The finding was 432 slots for a 72-slot appetite. Without this the
      // gate above is satisfied by any large number, including the 384
      // forward hours that caused the problem.
      assert.ok(
        forecastHours <= renderWindow + degradedMaxAgeHours + 24,
        `forecast_hours=${forecastHours} is more than a day of slack over the ` +
          `${renderWindow + degradedMaxAgeHours}h the app can actually read`
      );
    });
  });
});

describe("the request actually carries the window", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("fetchWeather sends forecast_hours and past_hours", async () => {
    // Reading the constants proves they are declared. This proves they reach
    // the wire — the original defect was a parameter that was never sent.
    let requestUrl = null;
    globalThis.fetch = async (url) => {
      requestUrl = new URL(String(url));
      return new Response(
        JSON.stringify({
          latitude: 41.6967,
          longitude: -87.8178,
          timezone: "America/Chicago",
          current: {},
          hourly: {},
          daily: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await fetchWeather(41.6967, -87.8178);

    assert.ok(requestUrl, "fetchWeather did not issue a request");
    const source = read("openMeteo");
    assert.equal(
      requestUrl.searchParams.get("forecast_hours"),
      String(readNumber(source, "forecastHours", "openMeteo.js"))
    );
    assert.equal(
      requestUrl.searchParams.get("past_hours"),
      String(readNumber(source, "pastHours", "openMeteo.js"))
    );
  });

  test("the window it sends is the one the hourly card can use", async () => {
    // The end-to-end statement, in the units the failure would appear in:
    // hours of forecast still ahead of a snapshot at its maximum replay age.
    const forecastHours = readNumber(read("openMeteo"), "forecastHours", "openMeteo.js");
    const degradedMaxAgeHours = readNumber(
      read("weatherData"),
      "degradedMaxAge",
      "useWeatherData.js"
    );
    const renderWindow = readNumber(read("hourlyCard"), "renderWindow", "HourlyCard.jsx");

    const capturedAt = Date.UTC(2026, 8, 17, 12, 0);
    const replayedAt = capturedAt + degradedMaxAgeHours * HOUR_MS;
    const lastSlot = capturedAt + forecastHours * HOUR_MS;

    assert.ok(
      lastSlot - replayedAt >= (renderWindow - 1) * HOUR_MS,
      "the oldest replayable snapshot would render a short hourly card"
    );
  });
});
