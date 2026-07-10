import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getWeather,
  gradientCss,
  weatherCodes,
  UNKNOWN_WEATHER,
} from "./weatherCodes.js";

describe("getWeather", () => {
  test("returns the matching descriptor for a known WMO code", () => {
    assert.equal(getWeather(0).label, "Clear");
    assert.equal(getWeather(63).label, "Rain");
    assert.equal(getWeather(95).label, "Thunderstorm");
  });

  test("reports an unrecognised numeric code as unknown, not as clear", () => {
    assert.equal(getWeather(999), UNKNOWN_WEATHER);
  });

  test("reports missing or non-numeric input as unknown, not as clear", () => {
    // WMO code 0 means "Clear". Coercing an absent reading to 0 would
    // paint a confident sunny sky over data we never received.
    for (const absent of [null, undefined, "not-a-code", NaN, "", true, {}]) {
      assert.equal(getWeather(absent), UNKNOWN_WEATHER);
    }
  });

  test("still resolves a genuine zero to Clear", () => {
    // The contract distinguishes "missing" from "zero": code 0 is a real
    // reading and must not be swept into the unknown descriptor.
    assert.equal(getWeather(0).label, "Clear");
  });

  test("the unknown descriptor exposes a usable 3-stop gradient", () => {
    assert.equal(UNKNOWN_WEATHER.gradient.length, 3);
    assert.ok(gradientCss(UNKNOWN_WEATHER.gradient).startsWith("linear-gradient("));
  });

  test("truncates non-integer codes before lookup", () => {
    // 63.7 should resolve to code 63 (Rain).
    assert.equal(getWeather(63.7).label, "Rain");
  });

  test("every descriptor exposes a 3-stop gradient", () => {
    for (const [code, descriptor] of Object.entries(weatherCodes)) {
      assert.ok(
        Array.isArray(descriptor.gradient) && descriptor.gradient.length === 3,
        `code ${code} must expose a 3-stop gradient`
      );
      for (const color of descriptor.gradient) {
        assert.equal(typeof color, "string");
      }
    }
  });
});

describe("gradientCss", () => {
  test("composes a linear-gradient from a 3-stop array", () => {
    const css = gradientCss(["#fb923c", "#ec4899", "#6366f1"]);
    assert.ok(css.startsWith("linear-gradient("));
    assert.ok(css.includes("#fb923c"));
    assert.ok(css.includes("#ec4899"));
    assert.ok(css.includes("#6366f1"));
  });

  test("falls back to a default gradient for missing or short input", () => {
    const fallback = gradientCss(null);
    assert.ok(fallback.startsWith("linear-gradient("));
    assert.equal(gradientCss([]), fallback);
    assert.equal(gradientCss(["#000"]), fallback);
    assert.equal(gradientCss(["#000", "#fff"]), fallback);
  });
});
