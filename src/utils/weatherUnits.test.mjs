import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  getApiTemperatureUnit,
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  formatWindSpeed,
  formatPrecipitation,
  normalizeLatitude,
  normalizeLongitude,
  parseCoordinates,
  validateCoordinates,
  toFahrenheit,
} from "./weatherUnits.js";

describe("weatherUnits", () => {
  test("converts display units to API units", () => {
    assert.equal(getApiTemperatureUnit("C"), "celsius");
    assert.equal(getApiTemperatureUnit("F"), "fahrenheit");
    assert.equal(getApiWindSpeedUnit("C"), "kmh");
    assert.equal(getApiWindSpeedUnit("F"), "mph");
    assert.equal(getApiPrecipUnit("C"), "mm");
    assert.equal(getApiPrecipUnit("F"), "inch");
  });

  test("formats wind speed while preserving source units", () => {
    assert.equal(formatWindSpeed(10, "F", "F"), "10 mph");
    assert.equal(formatWindSpeed(10, "C", "F"), "16 km/h");
    assert.equal(formatWindSpeed(16.0934, "F", "C"), "10 mph");
    assert.equal(formatWindSpeed("not-a-number", "C"), "\u2014");
  });

  test("formats precipitation with source and target units", () => {
    assert.equal(formatPrecipitation(1, "F", "F"), "1.00 in");
    assert.equal(formatPrecipitation(25.4, "F", "C"), "1.00 in");
    assert.equal(formatPrecipitation(1, "C", "F"), "25.40 mm");
    assert.equal(formatPrecipitation("not-a-number", "C"), "\u2014");
  });

  test("normalizes coordinates and keeps valid values", () => {
    assert.equal(normalizeLatitude(41.9), 41.9);
    assert.equal(normalizeLongitude(-87.63), -87.63);
    assert.equal(normalizeLatitude("invalid"), null);
    assert.equal(normalizeLongitude(undefined), null);
    assert.equal(normalizeLatitude(95), null);
    assert.equal(normalizeLongitude(200), null);
  });

  test("parses and validates coordinate pairs", () => {
    assert.deepEqual(parseCoordinates(41.88, -87.63), {
      latitude: 41.88,
      longitude: -87.63,
    });
    assert.equal(parseCoordinates("invalid", -87.63), null);
    assert.equal(parseCoordinates(41.88, 181), null);
    assert.throws(() => validateCoordinates(95, -87.63), /Invalid coordinates/);
    assert.throws(() => validateCoordinates(41.88, 181), /Invalid coordinates/);
    assert.deepEqual(validateCoordinates("41.88", "-87.63"), {
      latitude: 41.88,
      longitude: -87.63,
    });
  });

  test("supports dewpoint conversion to Fahrenheit", () => {
    assert.equal(toFahrenheit(0, "C"), 32);
    assert.equal(toFahrenheit(100, "F"), 100);
  });
});
