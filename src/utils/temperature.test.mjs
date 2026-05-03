import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  convertTemp,
  formatTemperatureValue,
  formatTemperatureWithUnit,
} from "./temperature.js";

describe("convertTemp", () => {
  test("rounds Fahrenheit input as-is when the unit is F", () => {
    assert.equal(convertTemp(67.4, "F"), 67);
    assert.equal(convertTemp(0, "F"), 0);
    assert.equal(convertTemp(-3.6, "F"), -4);
  });

  test("converts Fahrenheit to Celsius and rounds", () => {
    assert.equal(convertTemp(32, "C"), 0);
    assert.equal(convertTemp(212, "C"), 100);
    assert.equal(convertTemp(67.4, "C"), 20);
  });

  test("returns NaN for nullish or non-numeric input", () => {
    assert.ok(Number.isNaN(convertTemp(null, "F")));
    assert.ok(Number.isNaN(convertTemp(undefined, "F")));
    assert.ok(Number.isNaN(convertTemp("", "F")));
    assert.ok(Number.isNaN(convertTemp("abc", "F")));
  });
});

describe("formatTemperatureValue", () => {
  test("returns the rounded numeric string for valid input", () => {
    assert.equal(formatTemperatureValue(67.4, "F"), "67");
    assert.equal(formatTemperatureValue(67.4, "C"), "20");
  });

  test("returns the missing placeholder for nullish input", () => {
    assert.equal(formatTemperatureValue(null, "F"), "—");
    assert.equal(formatTemperatureValue(undefined, "F"), "—");
    assert.equal(formatTemperatureValue("", "F"), "—");
  });
});

describe("formatTemperatureWithUnit", () => {
  test("appends the °F suffix for valid Fahrenheit input", () => {
    assert.equal(formatTemperatureWithUnit(67.4, "F"), "67°F");
  });

  test("appends the °C suffix for valid Celsius input", () => {
    assert.equal(formatTemperatureWithUnit(67.4, "C"), "20°C");
    assert.equal(formatTemperatureWithUnit(0, "C"), "-18°C");
  });

  test("omits the unit suffix on the missing path so the UI never renders '—°F'", () => {
    assert.equal(formatTemperatureWithUnit(null, "F"), "—");
    assert.equal(formatTemperatureWithUnit(null, "C"), "—");
    assert.equal(formatTemperatureWithUnit(undefined, "F"), "—");
    assert.equal(formatTemperatureWithUnit("", "C"), "—");
  });
});
