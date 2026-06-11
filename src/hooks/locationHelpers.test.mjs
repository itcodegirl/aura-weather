import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hasMatchingCoordinates,
  toLocationPayload,
  resolveInitialLocationState,
} from "./locationHelpers.js";
import {
  DEFAULT_LOCATION,
  LOCATION_FALLBACK_NOTICE,
  SAVED_LOCATION_NOTICE,
} from "./useLocation.js";

describe("toLocationPayload", () => {
  test("returns a normalized payload for valid coordinates", () => {
    assert.deepEqual(
      toLocationPayload(41.8781, -87.6298, "Chicago", "United States"),
      {
        lat: 41.8781,
        lon: -87.6298,
        name: "Chicago",
        country: "United States",
      }
    );
  });

  test("trims whitespace from name and country", () => {
    assert.deepEqual(
      toLocationPayload(0, 0, "  Null Island  ", "  "),
      { lat: 0, lon: 0, name: "Null Island", country: "" }
    );
  });

  test("returns null when coordinates are missing or out of range", () => {
    assert.equal(toLocationPayload(null, null), null);
    assert.equal(toLocationPayload("bad", "bad"), null);
    assert.equal(toLocationPayload(91, 0), null);
    assert.equal(toLocationPayload(0, 181), null);
  });

  test("falls back to empty strings for non-string name and country", () => {
    const payload = toLocationPayload(0, 0, undefined, null);
    assert.equal(payload.name, "");
    assert.equal(payload.country, "");
  });
});

describe("hasMatchingCoordinates", () => {
  test("returns true for identical lat/lon pairs", () => {
    assert.equal(
      hasMatchingCoordinates(
        { lat: 41.8781, lon: -87.6298 },
        { lat: 41.8781, lon: -87.6298 }
      ),
      true
    );
  });

  test("returns false for different lat/lon pairs", () => {
    assert.equal(
      hasMatchingCoordinates(
        { lat: 41.8781, lon: -87.6298 },
        { lat: 35.6762, lon: 139.6503 }
      ),
      false
    );
  });

  test("returns false when either input has invalid coordinates", () => {
    assert.equal(
      hasMatchingCoordinates(
        { lat: 41.8781, lon: -87.6298 },
        { lat: "bad", lon: "bad" }
      ),
      false
    );
    assert.equal(
      hasMatchingCoordinates(null, { lat: 0, lon: 0 }),
      false
    );
    assert.equal(
      hasMatchingCoordinates({ lat: 0, lon: 0 }, undefined),
      false
    );
  });
});

describe("resolveInitialLocationState", () => {
  const persisted = {
    lat: 41.8781,
    lon: -87.6298,
    name: "Chicago",
    country: "United States",
  };
  const shared = {
    lat: 35.6762,
    lon: 139.6503,
    name: "Tokyo",
    country: "Japan",
  };

  test("falls back to the default location with the setup prompt", () => {
    const state = resolveInitialLocationState();
    assert.equal(state.location, DEFAULT_LOCATION);
    assert.equal(state.startupLocation, null);
    assert.equal(state.notice, LOCATION_FALLBACK_NOTICE);
    assert.equal(state.hasPersistedLocation, false);
  });

  test("uses the persisted startup location when there is no URL link", () => {
    const state = resolveInitialLocationState({ persistedLocation: persisted });
    assert.equal(state.location, persisted);
    assert.equal(state.startupLocation, persisted);
    assert.equal(state.notice, SAVED_LOCATION_NOTICE);
    assert.equal(state.hasPersistedLocation, true);
  });

  test("a deep link wins over the persisted city without clobbering startup", () => {
    const state = resolveInitialLocationState({
      urlLocation: shared,
      persistedLocation: persisted,
    });
    assert.equal(state.location, shared);
    // The user's own startup city is preserved as the home base.
    assert.equal(state.startupLocation, persisted);
    assert.equal(state.notice, null);
    assert.equal(state.hasPersistedLocation, true);
  });

  test("a deep link for a first-time visitor seeds no startup city", () => {
    const state = resolveInitialLocationState({ urlLocation: shared });
    assert.equal(state.location, shared);
    assert.equal(state.startupLocation, null);
    assert.equal(state.hasPersistedLocation, false);
  });

  test("a link matching the startup city is treated as a normal open", () => {
    const state = resolveInitialLocationState({
      urlLocation: { ...persisted, name: "Chicago" },
      persistedLocation: persisted,
    });
    assert.equal(state.location, persisted);
    assert.equal(state.notice, SAVED_LOCATION_NOTICE);
    assert.equal(state.hasPersistedLocation, true);
  });
});
