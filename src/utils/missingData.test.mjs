import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MISSING_VALUE_DASH,
  MISSING_VALUE_LABEL,
  toFiniteNumber,
  hasFiniteValue,
  formatMissingValue,
} from "./missingData.js";

describe("missingData helpers", () => {
  test("toFiniteNumber returns the numeric value when finite", () => {
    assert.equal(toFiniteNumber(0), 0);
    assert.equal(toFiniteNumber(42), 42);
    assert.equal(toFiniteNumber("3.14"), 3.14);
    assert.equal(toFiniteNumber(-7.5), -7.5);
  });

  test("toFiniteNumber returns the fallback for non-finite input", () => {
    assert.equal(toFiniteNumber(null), null);
    assert.equal(toFiniteNumber(undefined), null);
    assert.equal(toFiniteNumber("not-a-number"), null);
    assert.equal(toFiniteNumber(Number.NaN), null);
    assert.equal(toFiniteNumber(Infinity), null);
    assert.equal(toFiniteNumber(-Infinity), null);
    assert.equal(toFiniteNumber(undefined, 0), 0);
    assert.equal(toFiniteNumber("xyz", "fallback"), "fallback");
  });

  test("hasFiniteValue distinguishes finite numbers from missing data", () => {
    assert.equal(hasFiniteValue(0), true);
    assert.equal(hasFiniteValue(123.4), true);
    assert.equal(hasFiniteValue("12"), true);
    assert.equal(hasFiniteValue(null), false);
    assert.equal(hasFiniteValue(undefined), false);
    assert.equal(hasFiniteValue("nope"), false);
    assert.equal(hasFiniteValue(Number.NaN), false);
  });

  test("formatMissingValue returns the dash glyph by default and the label when requested", () => {
    assert.equal(formatMissingValue(), MISSING_VALUE_DASH);
    assert.equal(formatMissingValue({}), MISSING_VALUE_DASH);
    assert.equal(formatMissingValue({ unavailable: true }), MISSING_VALUE_LABEL);
  });
});
