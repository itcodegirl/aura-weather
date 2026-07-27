import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { sameLocation } from "./rainAlertHelpers.js";

const CHICAGO = { lat: 41.8781, lon: -87.6298 };

describe("sameLocation", () => {
  test("matches when rule and location agree within tolerance", () => {
    const rule = { location_lat: 41.87812, location_lon: -87.62983 };
    assert.equal(sameLocation(rule, CHICAGO), true);
  });

  test("accepts numeric-string coordinates from the backend", () => {
    const rule = { location_lat: "41.8781", location_lon: "-87.6298" };
    assert.equal(sameLocation(rule, CHICAGO), true);
  });

  test("does not match when coordinates differ beyond tolerance", () => {
    const rule = { location_lat: 41.9, location_lon: -87.6298 };
    assert.equal(sameLocation(rule, CHICAGO), false);
  });

  test("a rule with null coordinates never matches, even at (0, 0)", () => {
    // Number(null) is 0 — without the toFiniteNumber gate a malformed
    // row would pin itself to Null Island and match a location there.
    const rule = { location_lat: null, location_lon: null };
    assert.equal(sameLocation(rule, { lat: 0, lon: 0 }), false);
  });

  test("returns false when the active location is missing", () => {
    const rule = { location_lat: 41.8781, location_lon: -87.6298 };
    assert.equal(sameLocation(rule, null), false);
    assert.equal(sameLocation(rule, undefined), false);
  });

  test("rejects non-numeric coordinate shapes", () => {
    assert.equal(
      sameLocation({ location_lat: "", location_lon: -87.6298 }, CHICAGO),
      false
    );
    assert.equal(
      sameLocation({ location_lat: true, location_lon: -87.6298 }, CHICAGO),
      false
    );
  });
});
