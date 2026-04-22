import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  clearPersistedLocation,
  getPersistedLocation,
  getSavedCities,
  persistLocation,
  removeSavedCity,
  upsertSavedCity,
} from "./useLocation.js";

const store = new Map();

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

function restoreWindow() {
  delete globalThis.window;
}

afterEach(() => {
  store.clear();
  restoreWindow();
});

describe("location persistence helpers", () => {
  test("persists and reads a saved location", () => {
    globalThis.window = { localStorage: createLocalStorageMock() };

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
    globalThis.window = { localStorage: createLocalStorageMock() };

    persistLocation(34.0522, -118.2437, "Los Angeles", "United States");
    assert.notEqual(getPersistedLocation(), null);

    clearPersistedLocation();
    assert.equal(getPersistedLocation(), null);
  });

  test("stores saved cities for quick switching", () => {
    globalThis.window = { localStorage: createLocalStorageMock() };

    upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");
    upsertSavedCity(51.5072, -0.1276, "London", "United Kingdom");

    const savedCities = getSavedCities();
    assert.equal(savedCities.length, 2);
    assert.equal(savedCities[0].name, "London");
    assert.equal(savedCities[1].name, "Tokyo");
  });

  test("removes a saved city by coordinates", () => {
    globalThis.window = { localStorage: createLocalStorageMock() };

    upsertSavedCity(35.6762, 139.6503, "Tokyo", "Japan");
    upsertSavedCity(51.5072, -0.1276, "London", "United Kingdom");

    const remaining = removeSavedCity(35.6762, 139.6503);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].name, "London");
  });
});
