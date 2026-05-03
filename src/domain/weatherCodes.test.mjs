import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getWeather,
  gradientCss,
  weatherCodes,
} from "./weatherCodes.js";

describe("getWeather", () => {
  test("returns the matching descriptor for a known WMO code", () => {
    assert.equal(getWeather(0).label, "Clear");
    assert.equal(getWeather(63).label, "Rain");
    assert.equal(getWeather(95).label, "Thunderstorm");
  });

  test("falls back to the clear descriptor for unknown numeric codes", () => {
    assert.equal(getWeather(999).label, "Clear");
  });

  test("falls back to the clear descriptor for non-numeric input", () => {
    assert.equal(getWeather(null).label, "Clear");
    assert.equal(getWeather(undefined).label, "Clear");
    assert.equal(getWeather("not-a-code").label, "Clear");
    assert.equal(getWeather(NaN).label, "Clear");
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
