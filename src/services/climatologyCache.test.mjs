import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  climatologyCacheInternals,
  describeClimatologyTarget,
  readCachedClimatology,
  writeCachedClimatology,
} from "./climatologyCache.js";

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

function installWindow(storage = createLocalStorageMock()) {
  globalThis.window = { localStorage: storage };
}

function restoreWindow() {
  delete globalThis.window;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 3, 21, 18, 0, 0);
const CHICAGO = { latitude: 41.8781, longitude: -87.6298 };
const TARGET = {
  coordinates: CHICAGO,
  monthDay: "04-21",
  year: 2026,
  temperatureUnit: "fahrenheit",
};
const NORMAL = {
  averageHighTemperature: 63.4,
  averageTemperatureUnit: "fahrenheit",
  sampleYears: 30,
  referenceDateLabel: "April 21",
  timeRange: "1996-2025",
};

function readRawCache() {
  return JSON.parse(store.get(climatologyCacheInternals.CACHE_KEY));
}

afterEach(() => {
  store.clear();
  restoreWindow();
});

describe("describeClimatologyTarget", () => {
  test("names the calendar day and year in the location's zone", () => {
    // 2026-04-21T03:00Z is still the 20th in Chicago and already the 21st in Tokyo.
    const instant = Date.UTC(2026, 3, 21, 3, 0, 0);
    assert.deepEqual(describeClimatologyTarget("America/Chicago", instant), {
      year: 2026,
      monthDay: "04-20",
    });
    assert.deepEqual(describeClimatologyTarget("Asia/Tokyo", instant), {
      year: 2026,
      monthDay: "04-21",
    });
  });

  test("is null without a usable clock", () => {
    assert.equal(describeClimatologyTarget("America/Chicago", null), null);
    assert.equal(describeClimatologyTarget("America/Chicago", Number.NaN), null);
  });
});

describe("climatology cache", () => {
  test("writes and reads a normal for a place, day, year and unit", () => {
    installWindow();

    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);

    assert.deepEqual(readCachedClimatology(TARGET, NOW), NORMAL);
    const raw = readRawCache();
    assert.equal(raw.version, climatologyCacheInternals.CACHE_VERSION);
    assert.equal(Object.keys(raw.entries).length, 1);
  });

  test("coordinates share an entry within about a kilometre", () => {
    installWindow();
    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);

    const located = { latitude: 41.8823, longitude: -87.6321 };
    assert.deepEqual(
      readCachedClimatology({ ...TARGET, coordinates: located }, NOW),
      NORMAL,
      "the searched and the located coordinates of one city are one entry"
    );
    const elsewhere = { latitude: 42.36, longitude: -71.06 };
    assert.equal(readCachedClimatology({ ...TARGET, coordinates: elsewhere }, NOW), null);
  });

  test("misses on another day, another year or another unit", () => {
    installWindow();
    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);

    assert.equal(readCachedClimatology({ ...TARGET, monthDay: "04-22" }, NOW), null);
    // The 30-year window is anchored to the year; a new year moves it.
    assert.equal(readCachedClimatology({ ...TARGET, year: 2027 }, NOW + 300 * DAY_MS), null);
    assert.equal(readCachedClimatology({ ...TARGET, temperatureUnit: "celsius" }, NOW), null);
  });

  test("an entry older than the backstop is not served even if its year still matches", () => {
    installWindow();
    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);

    const beyond = NOW + climatologyCacheInternals.MAX_ENTRY_AGE_MS + DAY_MS;
    assert.equal(readCachedClimatology(TARGET, beyond), null);
  });

  test("an entry stamped well in the future is not trusted", () => {
    installWindow();
    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW + DAY_MS);

    assert.equal(readCachedClimatology(TARGET, NOW), null);
  });

  test("a normal that is not a finite number is not written", () => {
    installWindow();

    writeCachedClimatology(
      { ...TARGET, historicalAverage: { ...NORMAL, averageHighTemperature: null } },
      NOW
    );
    writeCachedClimatology(
      { ...TARGET, historicalAverage: { ...NORMAL, averageHighTemperature: "warm" } },
      NOW
    );

    assert.equal(readCachedClimatology(TARGET, NOW), null);
    assert.equal(store.size, 0);
  });

  test("a corrupt or foreign payload reads as empty and is replaced on the next write", () => {
    installWindow();
    store.set(climatologyCacheInternals.CACHE_KEY, "{not json");
    assert.equal(readCachedClimatology(TARGET, NOW), null);

    store.set(
      climatologyCacheInternals.CACHE_KEY,
      JSON.stringify({ version: 99, entries: { anything: { averageHighTemperature: 1 } } })
    );
    assert.equal(readCachedClimatology(TARGET, NOW), null);

    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);
    assert.deepEqual(readCachedClimatology(TARGET, NOW), NORMAL);
    assert.equal(Object.keys(readRawCache().entries).length, 1, "the foreign entry is gone");
  });

  test("a hand-edited entry with a non-numeric normal is skipped", () => {
    installWindow();
    writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW);
    const raw = readRawCache();
    const [key] = Object.keys(raw.entries);
    raw.entries[key].averageHighTemperature = "63.4°F";
    store.set(climatologyCacheInternals.CACHE_KEY, JSON.stringify(raw));

    assert.equal(readCachedClimatology(TARGET, NOW), null);
  });

  test("keeps the newest entries when the cap is exceeded", () => {
    installWindow();
    const { MAX_ENTRIES } = climatologyCacheInternals;
    for (let i = 0; i <= MAX_ENTRIES; i += 1) {
      writeCachedClimatology(
        {
          ...TARGET,
          coordinates: { latitude: 10 + i, longitude: 20 },
          historicalAverage: { ...NORMAL, averageHighTemperature: 50 + i },
        },
        NOW + i * 1000
      );
    }

    assert.equal(Object.keys(readRawCache().entries).length, MAX_ENTRIES);
    // The oldest write (i = 0) is the one evicted.
    assert.equal(
      readCachedClimatology({ ...TARGET, coordinates: { latitude: 10, longitude: 20 } }, NOW + DAY_MS),
      null
    );
    assert.equal(
      readCachedClimatology(
        { ...TARGET, coordinates: { latitude: 10 + MAX_ENTRIES, longitude: 20 } },
        NOW + DAY_MS
      )?.averageHighTemperature,
      50 + MAX_ENTRIES
    );
  });

  test("drops the oldest entry and retries when storage reports quota pressure", () => {
    let failNext = false;
    const storage = createLocalStorageMock();
    const realSetItem = storage.setItem;
    storage.setItem = (key, value) => {
      if (failNext) {
        failNext = false;
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      realSetItem(key, value);
    };
    installWindow(storage);

    writeCachedClimatology(
      { ...TARGET, coordinates: { latitude: 1, longitude: 1 }, historicalAverage: NORMAL },
      NOW
    );
    failNext = true;
    writeCachedClimatology(
      { ...TARGET, coordinates: { latitude: 2, longitude: 2 }, historicalAverage: NORMAL },
      NOW + 1000
    );

    const entries = readRawCache().entries;
    assert.equal(Object.keys(entries).length, 1);
    assert.ok(
      readCachedClimatology({ ...TARGET, coordinates: { latitude: 2, longitude: 2 } }, NOW + 2000),
      "the newer entry survived"
    );
  });

  test("does nothing without storage, and never throws", () => {
    restoreWindow();
    assert.doesNotThrow(() =>
      writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW)
    );
    assert.equal(readCachedClimatology(TARGET, NOW), null);

    globalThis.window = {
      get localStorage() {
        throw new Error("SecurityError");
      },
    };
    assert.doesNotThrow(() =>
      writeCachedClimatology({ ...TARGET, historicalAverage: NORMAL }, NOW)
    );
    assert.equal(readCachedClimatology(TARGET, NOW), null);
  });

  test("rejects an unusable key rather than caching under a junk one", () => {
    installWindow();
    writeCachedClimatology(
      { ...TARGET, coordinates: { latitude: null, longitude: -87 }, historicalAverage: NORMAL },
      NOW
    );
    writeCachedClimatology({ ...TARGET, monthDay: "April 21", historicalAverage: NORMAL }, NOW);
    writeCachedClimatology({ ...TARGET, temperatureUnit: "", historicalAverage: NORMAL }, NOW);
    assert.equal(store.size, 0);
    assert.equal(climatologyCacheInternals.getEntryKey(TARGET), "41.88,-87.63|04-21|fahrenheit");
  });
});
