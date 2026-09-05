import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { MAX_SAVED_CITIES, normalizeLocationName } from "./savedCities.js";

describe("normalizeLocationName", () => {
  test("trims a usable name", () => {
    assert.equal(normalizeLocationName("  Chicago  "), "Chicago");
    assert.equal(normalizeLocationName("Chicago"), "Chicago");
  });

  test("falls back when there is nothing usable", () => {
    assert.equal(normalizeLocationName("", "fallback"), "fallback");
    assert.equal(normalizeLocationName("   ", "fallback"), "fallback");
    assert.equal(normalizeLocationName(undefined, "default"), "default");
    assert.equal(normalizeLocationName(null, "default"), "default");
  });

  /*
   * Saved cities round-trip through a JSON backup, so a row can hold any
   * shape. Coercing would put "123" or "[object Object]" in the saved-cities
   * strip as if the user had named a place that; the fallback is the honest
   * answer for a value that is not a name.
   */
  test("a non-string is an absent name, never a coerced one", () => {
    assert.equal(normalizeLocationName(123, "fallback"), "fallback");
    assert.equal(normalizeLocationName({}, "fallback"), "fallback");
    assert.equal(normalizeLocationName([], "fallback"), "fallback");
    assert.equal(normalizeLocationName(true, "fallback"), "fallback");
  });

  test("the fallback itself defaults to an empty string", () => {
    assert.equal(normalizeLocationName(null), "");
  });
});

describe("MAX_SAVED_CITIES", () => {
  test("is the single cap every layer reads", () => {
    assert.equal(MAX_SAVED_CITIES, 6);
  });
});
