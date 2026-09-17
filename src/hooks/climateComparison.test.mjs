import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildClimateComparison } from "./climateComparison.js";

// 2026-05-02, noon UTC. The fixtures carry daily dates and no timezone,
// so today resolves in the runner's zone; noon keeps every zone on the
// same calendar date.
const NOW = Date.UTC(2026, 4, 2, 12, 0, 0);

function weatherWithHigh(high, extra = {}) {
  return {
    meta: {},
    current: { temperature: 78 },
    daily: { time: ["2026-05-02"], temperatureMax: [high] },
    ...extra,
  };
}

const AVERAGE = {
  averageHighTemperature: 65,
  sampleYears: 30,
  referenceDateLabel: "May 2",
  timeRange: "1996-2025",
};

describe("buildClimateComparison", () => {
  test("compares today's forecast high with the average high", () => {
    const result = buildClimateComparison(weatherWithHigh(78), AVERAGE, NOW);

    assert.ok(result, "expected a comparison object");
    assert.equal(result.todayHighTemperature, 78);
    assert.equal(result.difference, 13);
    assert.equal(result.differenceUnit, "F");
    assert.equal(result.sampleYears, 30);
    assert.equal(result.referenceDateLabel, "May 2");
    assert.equal(result.timeRange, "1996-2025");
  });

  test("the current temperature plays no part: like is compared with like", () => {
    // Audit finding A-04. 3 pm reads 95° against a day whose high is 80°;
    // the anomaly is the high's 15° over the average high, not the
    // instantaneous 30°.
    const afternoon = weatherWithHigh(80, { current: { temperature: 95 } });
    assert.equal(buildClimateComparison(afternoon, AVERAGE, NOW).difference, 15);
    // 4 am reads 55° on the same day: the same anomaly, not a "colder" one.
    const night = weatherWithHigh(80, { current: { temperature: 55 } });
    assert.equal(buildClimateComparison(night, AVERAGE, NOW).difference, 15);
  });

  test("returns a negative delta when the high is below the average high", () => {
    assert.equal(buildClimateComparison(weatherWithHigh(50), AVERAGE, NOW).difference, -15);
  });

  test("returns a zero delta when the highs match", () => {
    assert.equal(buildClimateComparison(weatherWithHigh(65), AVERAGE, NOW).difference, 0);
  });

  test("reads today's high, not index 0, in a snapshot restored from yesterday", () => {
    const stale = weatherWithHigh(null, {
      daily: { time: ["2026-05-01", "2026-05-02"], temperatureMax: [40, 78] },
    });
    assert.equal(buildClimateComparison(stale, AVERAGE, NOW).difference, 13);
  });

  test("returns null when the historical average is missing", () => {
    assert.equal(buildClimateComparison(weatherWithHigh(70), null, NOW), null);
    assert.equal(buildClimateComparison(weatherWithHigh(70), undefined, NOW), null);
  });

  test("returns null when today's high is missing or non-finite", () => {
    assert.equal(buildClimateComparison(weatherWithHigh(null), AVERAGE, NOW), null);
    assert.equal(buildClimateComparison(weatherWithHigh("not-a-number"), AVERAGE, NOW), null);
    assert.equal(
      buildClimateComparison({ current: { temperature: 70 } }, AVERAGE, NOW),
      null,
      "a current temperature alone is not enough"
    );
  });

  test("returns null when the historical average is non-finite", () => {
    assert.equal(
      buildClimateComparison(weatherWithHigh(70), { averageHighTemperature: null }, NOW),
      null
    );
    assert.equal(
      buildClimateComparison(weatherWithHigh(70), { averageHighTemperature: "" }, NOW),
      null
    );
    // The field this replaced is not read: an old-shaped sample is missing.
    assert.equal(
      buildClimateComparison(weatherWithHigh(70), { averageTemperature: 65 }, NOW),
      null
    );
  });
});
