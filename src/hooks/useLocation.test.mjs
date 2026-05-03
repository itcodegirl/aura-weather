import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  clearPersistedLocation,
  getPersistedLocation,
  getSavedCities,
  MAX_SAVED_CITIES,
  normalizeLocationName,
  persistLocation,
  removeSavedCity,
  replaceSavedCities,
  upsertSavedCity,
} from "./useLocation.js";

const store = new Map();
const STORAGE_KEYS = {
  lastLocation: "aura-weather-last-location",
  savedCities: "aura-weather-saved-cities",
};

function createLocalStorageMock() {
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function installWindow() {
  globalThis.window = { localStorage: createLocalStorageMock() };
}

function restoreWindow() {
  delete globalThis.window;
}

afterEach(() => {
  store.clear();
  restoreWindow();
});

describe("location persistence helpers", () => {
  test("persists and reads a saved location", () => {
    installWindow();

    persistLocation(41.8781, -87.6298, "Chicago", "United States");
    const persisted = getPersistedLocation();

    assert.deepEqual(persisted, {
      lat: 41.8781,
      lon: -87.6298,
      name: "Chicago",
      country: "United States",
    });
  });

  test("clears persisted location from storage", () => {
    installWindow();

    persistLocation(34.0522, -118.2437, "Los Angeles", "United States");
    assert.notEqual(getPersistedLocation(), null);

    clearPersistedLocation();
    assert.equal(getPersistedLocation(), null);
  });

  test("stores saved cities for quick switching", () => {
    installWindow();

    upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");
    upsertSavedCity(51.5072, -0.1276, "London", "United Kingdom");

    const savedCities = getSavedCities();
    assert.equal(savedCities.length, 2);
    assert.equal(savedCities[0].name, "London");
    assert.equal(savedCities[1].name, "Tokyo");
  });

  test("removes a saved city by coordinates", () => {
    installWindow();

    upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");
    upsertSavedCity(51.5072, -0.1276, "London", "United Kingdom");

    const remaining = removeSavedCity(35.6762, 139.6503);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].name, "London");
  });

  test("returns null and removes the entry when persisted location is older than the TTL", () => {
    installWindow();

    const expiredTimestamp = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000
    ).toISOString();
    store.set(
      STORAGE_KEYS.lastLocation,
      JSON.stringify({
        lat: 41.8781,
        lon: -87.6298,
        name: "Chicago",
        country: "United States",
        updatedAt: expiredTimestamp,
      })
    );

    assert.equal(getPersistedLocation(), null);
    assert.equal(store.has(STORAGE_KEYS.lastLocation), false);
  });

  test("returns null and removes the entry when persisted coordinates are invalid", () => {
    installWindow();

    store.set(
      STORAGE_KEYS.lastLocation,
      JSON.stringify({
        lat: "not-a-number",
        lon: "also-bad",
        name: "Bad",
        country: "Bad",
        updatedAt: new Date().toISOString(),
      })
    );

    assert.equal(getPersistedLocation(), null);
    assert.equal(store.has(STORAGE_KEYS.lastLocation), false);
  });

  test("upsertSavedCity moves an existing entry to the front instead of duplicating", () => {
    installWindow();

    upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");
    upsertSavedCity(51.5072, -0.1276, "London", "United Kingdom");
    const reordered = upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");

    assert.equal(reordered.length, 2);
    assert.equal(reordered[0].name, "Tokyo");
    assert.equal(reordered[1].name, "London");
  });

  test("upsertSavedCity caps the saved list at MAX_SAVED_CITIES", () => {
    installWindow();

    for (let i = 0; i < MAX_SAVED_CITIES + 3; i += 1) {
      upsertSavedCity(i, i, `City ${i}`, "");
    }

    const savedCities = getSavedCities();
    assert.equal(savedCities.length, MAX_SAVED_CITIES);
    // Most recent upsert should be at the front.
    assert.equal(
      savedCities[0].name,
      `City ${MAX_SAVED_CITIES + 2}`
    );
  });

  test("ignores invalid coordinates on upsert", () => {
    installWindow();

    upsertSavedCity(91, 0, "Invalid lat", "");
    upsertSavedCity(0, 181, "Invalid lon", "");
    const validResult = upsertSavedCity(0, 0, "Null Island", "");

    assert.equal(validResult.length, 1);
    assert.equal(validResult[0].name, "Null Island");
  });

  test("replaceSavedCities normalizes and dedupes incoming entries", () => {
    installWindow();

    const result = replaceSavedCities([
      { lat: 41.8781, lon: -87.6298, name: "Chicago" },
      { lat: 41.87810001, lon: -87.62980001, name: "Chicago dupe" },
      { lat: 35.6762, lon: 139.6503 },
      { lat: "bad", lon: "bad" },
    ]);

    assert.equal(result.length, 2);
    assert.equal(result[0].name, "Chicago");
    assert.equal(result[1].name, "Saved place");
  });

  test("getSavedCities tolerates corrupt JSON without crashing", () => {
    installWindow();
    store.set(STORAGE_KEYS.savedCities, "{not valid json");

    assert.deepEqual(getSavedCities(), []);
    assert.equal(store.has(STORAGE_KEYS.savedCities), false);
  });

  test("normalizeLocationName trims and falls back when empty", () => {
    assert.equal(normalizeLocationName("  Chicago  "), "Chicago");
    assert.equal(normalizeLocationName("", "fallback"), "fallback");
    assert.equal(normalizeLocationName(undefined, "default"), "default");
    assert.equal(normalizeLocationName(null, "default"), "default");
    assert.equal(normalizeLocationName(123, "fallback"), "fallback");
  });
});
