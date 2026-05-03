import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildClimateComparison } from "./climateComparison.js";

describe("buildClimateComparison", () => {
  test("returns a comparison with positive delta when warmer than average", () => {
    const result = buildClimateComparison(
      { current: { temperature: 78 } },
      {
        averageTemperature: 65,
        sampleYears: 30,
        referenceDateLabel: "May 2",
        timeRange: "1995-2024",
      }
    );

    assert.ok(result, "expected a comparison object");
    assert.equal(result.difference, 13);
    assert.equal(result.differenceUnit, "F");
    assert.equal(result.sampleYears, 30);
    assert.equal(result.referenceDateLabel, "May 2");
    assert.equal(result.timeRange, "1995-2024");
  });

  test("returns a negative delta when cooler than average", () => {
    const result = buildClimateComparison(
      { current: { temperature: 50 } },
      { averageTemperature: 65 }
    );
    assert.equal(result.difference, -15);
  });

  test("returns a zero delta when temperatures match", () => {
    const result = buildClimateComparison(
      { current: { temperature: 65 } },
      { averageTemperature: 65 }
    );
    assert.equal(result.difference, 0);
  });

  test("returns null when historical average is missing", () => {
    assert.equal(
      buildClimateComparison({ current: { temperature: 70 } }, null),
      null
    );
    assert.equal(
      buildClimateComparison({ current: { temperature: 70 } }, undefined),
      null
    );
  });

  test("returns null when current temperature is non-finite", () => {
    assert.equal(
      buildClimateComparison(
        { current: { temperature: null } },
        { averageTemperature: 65 }
      ),
      null
    );
    assert.equal(
      buildClimateComparison(
        { current: { temperature: "not-a-number" } },
        { averageTemperature: 65 }
      ),
      null
    );
  });

  test("returns null when historical average is non-finite", () => {
    assert.equal(
      buildClimateComparison(
        { current: { temperature: 70 } },
        { averageTemperature: null }
      ),
      null
    );
    assert.equal(
      buildClimateComparison(
        { current: { temperature: 70 } },
        { averageTemperature: undefined }
      ),
      null
    );
  });

  test("returns null when weatherData has no current section", () => {
    assert.equal(
      buildClimateComparison({}, { averageTemperature: 65 }),
      null
    );
    assert.equal(
      buildClimateComparison(null, { averageTemperature: 65 }),
      null
    );
  });

  test("preserves additional historical fields on success", () => {
    const result = buildClimateComparison(
      { current: { temperature: 70 } },
      {
        averageTemperature: 60,
        averageTemperatureUnit: "fahrenheit",
        sampleYears: 28,
        referenceDateLabel: "January 15",
        timeRange: "1995-2023",
      }
    );

    assert.equal(result.averageTemperature, 60);
    assert.equal(result.averageTemperatureUnit, "fahrenheit");
    assert.equal(result.sampleYears, 28);
    assert.equal(result.timeRange, "1995-2023");
  });
});
