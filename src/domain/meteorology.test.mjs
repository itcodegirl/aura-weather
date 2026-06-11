import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  calculatePressureTrend,
  classifyComfort,
  classifyStormRisk,
} from "./meteorology.js";
import { classifyWind, windDirectionName } from "./wind.js";

function buildHourlyIsoTimes(count, hourOffsetFromNow = 0) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const relativeHours = hourOffsetFromNow - (count - 1 - index);
    return new Date(now + relativeHours * 60 * 60 * 1000).toISOString();
  });
}

describe("meteorology utils", () => {
  test("classifyStormRisk uses CAPE thresholds and storm code override", () => {
    assert.deepEqual(classifyStormRisk(50, 0), {
      level: "Minimal",
      color: "#38bdf8",
      score: 0,
    });
    assert.deepEqual(classifyStormRisk(700, 0), {
      level: "Moderate",
      color: "#eab308",
      score: 2,
    });
    assert.deepEqual(classifyStormRisk(300, 95), {
      level: "Severe",
      color: "#dc2626",
      score: 4,
    });
  });

  test("calculatePressureTrend detects rising/falling/stable signals", () => {
    const times = buildHourlyIsoTimes(8, 0);

    const rising = calculatePressureTrend(
      [1000, 1000, 1000.5, 1001, 1001.5, 1002, 1002.5, 1003],
      times
    );
    assert.equal(rising.direction, "rising");
    assert.equal(rising.interpretation, "Clearing");

    const falling = calculatePressureTrend(
      [1005, 1005, 1004.5, 1004, 1003.5, 1003, 1002.5, 1002],
      times
    );
    assert.equal(falling.direction, "falling");
    assert.equal(falling.interpretation, "Storm possible");

    const steady = calculatePressureTrend(
      [1000, 1000, 1000.2, 1000.4, 1000.5, 1000.4, 1000.5, 1000.4],
      times
    );
    assert.equal(steady.direction, "steady");
    assert.equal(steady.interpretation, "Stable");
  });

  test("calculatePressureTrend refuses to call a single sample 'Stable'", () => {
    // One usable reading compares against itself (delta 0), which used
    // to present as a confident "Stable" trend computed from no trend
    // data. The current value is still surfaced; the trend is not.
    const times = buildHourlyIsoTimes(8, 0);
    const singleSample = calculatePressureTrend(
      [1012, null, null, null, null, null, null, null],
      times
    );
    assert.equal(singleSample.current, 1012);
    assert.equal(singleSample.interpretation, "Not enough data");
    assert.equal(singleSample.direction, "steady");
  });

  test("calculatePressureTrend returns defaults for invalid input", () => {
    const empty = calculatePressureTrend([], []);
    assert.deepEqual(empty, {
      current: null,
      delta: 0,
      direction: "steady",
      interpretation: "No data",
      sparkline: [],
    });
  });

  test("calculatePressureTrend skips null pressure samples instead of treating them as 0", () => {
    // A null hourly pressure must NOT coerce to 0 (a fake near-vacuum
    // reading) and crash the rolling 6-hour delta downward into a
    // false "Storm possible" signal.
    const times = buildHourlyIsoTimes(8, 0);
    const withNulls = calculatePressureTrend(
      [1010, null, 1010, 1010, 1010, 1010, 1010, 1010],
      times
    );
    assert.equal(withNulls.direction, "steady");
    assert.equal(withNulls.interpretation, "Stable");
  });

  test("classifyStormRisk treats null cape as Minimal (not silently 0)", () => {
    // The fallback IS 0 for cape, but the path must come from explicit
    // strict coercion — not from Number(null) silently returning 0.
    assert.deepEqual(classifyStormRisk(null, 0), {
      level: "Minimal",
      color: "#38bdf8",
      score: 0,
    });
  });

  test("classifyComfort handles F/C input and invalid values", () => {
    assert.equal(classifyComfort(45, "F").level, "Dry");
    assert.equal(classifyComfort(10, "C").level, "Comfortable");
    assert.equal(classifyComfort(20, "C").level, "Humid");
    assert.equal(classifyComfort("bad", "F").level, "Unknown");
  });

  test("windDirectionName maps headings and handles invalid values", () => {
    assert.equal(windDirectionName(0), "N");
    assert.equal(windDirectionName(45), "NE");
    assert.equal(windDirectionName(225), "SW");
    assert.equal(windDirectionName("bad"), "Variable");
  });

  test("windDirectionName returns 'Variable' for nullish input (not 'N')", () => {
    // Trust contract: a null heading must not silently coerce to 0
    // and resolve to "N" — that would imply a confident "wind from
    // the north" reading when the API returned no sample.
    assert.equal(windDirectionName(null), "Variable");
    assert.equal(windDirectionName(undefined), "Variable");
    assert.equal(windDirectionName(""), "Variable");
  });

  test("classifyWind uses mph thresholds and unit conversion", () => {
    assert.equal(classifyWind(2, "F"), "Calm");
    assert.equal(classifyWind(10, "F"), "Light breeze");
    assert.equal(classifyWind(16.0934, "C"), "Light breeze");
    assert.equal(classifyWind("bad", "F"), "Unknown");
  });

  test("classifyWind returns 'Unknown' for nullish input (not 'Calm')", () => {
    // A null wind speed must not coerce to 0 and resolve to "Calm".
    assert.equal(classifyWind(null, "F"), "Unknown");
    assert.equal(classifyWind(undefined, "C"), "Unknown");
    assert.equal(classifyWind("", "F"), "Unknown");
  });
});
