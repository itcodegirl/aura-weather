import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  readCachedWeatherSnapshot,
  writeCachedWeatherSnapshot,
  weatherSnapshotCacheInternals,
} from "./weatherSnapshotCache.js";

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

function installWindow() {
  globalThis.window = { localStorage: createLocalStorageMock() };
}

function restoreWindow() {
  delete globalThis.window;
}

function buildWeather(label = "cached") {
  return {
    meta: { timezone: "America/Chicago" },
    current: {
      temperature: 67,
      conditionCode: 2,
    },
    daily: {
      time: ["2026-04-21"],
      temperatureMax: [70],
      temperatureMin: [55],
    },
    label,
  };
}

function readRawCache() {
  return JSON.parse(store.get(weatherSnapshotCacheInternals.CACHE_KEY));
}

afterEach(() => {
  store.clear();
  restoreWindow();
});

describe("weather snapshot cache", () => {
  test("writes and reads a forecast snapshot by rounded coordinates", () => {
    installWindow();
    const cachedAt = Date.now();

    writeCachedWeatherSnapshot({
      coordinates: { latitude: 41.8781123, longitude: -87.6298123 },
      weather: buildWeather(),
      trustMeta: { weatherFetchedAt: 1_700_000_000_000 },
      cachedAt,
    });

    const snapshot = readCachedWeatherSnapshot({
      latitude: 41.8781,
      longitude: -87.6298,
    });

    assert.equal(snapshot.cachedAt, cachedAt);
    assert.equal(snapshot.weather.current.temperature, 67);
    assert.equal(snapshot.trustMeta.weatherFetchedAt, 1_700_000_000_000);
  });

  test("returns null for missing storage, corrupt JSON, invalid version, or bad coordinates", () => {
    assert.equal(
      readCachedWeatherSnapshot({ latitude: 41.8781, longitude: -87.6298 }),
      null
    );

    installWindow();
    store.set(weatherSnapshotCacheInternals.CACHE_KEY, "{not-json");
    assert.equal(
      readCachedWeatherSnapshot({ latitude: 41.8781, longitude: -87.6298 }),
      null
    );

    store.set(
      weatherSnapshotCacheInternals.CACHE_KEY,
      JSON.stringify({ version: 999, snapshots: {} })
    );
    assert.equal(
      readCachedWeatherSnapshot({ latitude: 41.8781, longitude: -87.6298 }),
      null
    );

    writeCachedWeatherSnapshot({
      coordinates: { latitude: null, longitude: -87.6298 },
      weather: buildWeather(),
    });
    assert.equal(
      readCachedWeatherSnapshot({ latitude: null, longitude: -87.6298 }),
      null
    );
  });

  test("keeps only the newest cached locations", () => {
    installWindow();

    for (let index = 0; index < 10; index += 1) {
      writeCachedWeatherSnapshot({
        coordinates: {
          latitude: 40 + index,
          longitude: -80 - index,
        },
        weather: buildWeather(`cached-${index}`),
        cachedAt: 1_700_000_000_000 + index,
      });
    }

    const payload = readRawCache();
    const snapshots = Object.values(payload.snapshots);

    assert.equal(snapshots.length, 8);
    assert.equal(
      snapshots.some((snapshot) => snapshot.weather.label === "cached-0"),
      false
    );
    assert.equal(
      snapshots.some((snapshot) => snapshot.weather.label === "cached-9"),
      true
    );
  });

  test("evicts the oldest snapshot and retries when storage quota is exceeded", () => {
    let allowSet = false;
    const writes = [];
    globalThis.window = {
      localStorage: {
        getItem(key) {
          return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
          writes.push(value);
          if (!allowSet) {
            const error = new Error("Quota exceeded");
            error.name = "QuotaExceededError";
            throw error;
          }
          store.set(key, String(value));
        },
        removeItem(key) {
          store.delete(key);
        },
      },
    };

    // Seed the in-memory store with a payload of two snapshots so the
    // retry path has something to evict.
    allowSet = true;
    writeCachedWeatherSnapshot({
      coordinates: { latitude: 41.8781, longitude: -87.6298 },
      weather: buildWeather("first"),
      cachedAt: 1_700_000_000_000,
    });
    writeCachedWeatherSnapshot({
      coordinates: { latitude: 35.6762, longitude: 139.6503 },
      weather: buildWeather("second"),
      cachedAt: 1_700_000_010_000,
    });

    // Simulate quota pressure on the next write. We want exactly one
    // retry: first call throws, second call succeeds.
    let setCalls = 0;
    globalThis.window.localStorage.setItem = (key, value) => {
      setCalls += 1;
      if (setCalls === 1) {
        const error = new Error("Quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }
      store.set(key, String(value));
    };

    writeCachedWeatherSnapshot({
      coordinates: { latitude: 51.5074, longitude: -0.1278 },
      weather: buildWeather("third"),
      cachedAt: 1_700_000_020_000,
    });

    // After eviction, the oldest snapshot ("first") should be gone but
    // "second" and the new "third" should remain.
    const payload = readRawCache();
    const labels = Object.values(payload.snapshots).map(
      (snapshot) => snapshot.weather.label
    );
    assert.equal(labels.includes("first"), false);
    assert.equal(labels.includes("second"), true);
    assert.equal(labels.includes("third"), true);
    assert.equal(setCalls, 2);
  });

  test("does not restore forecasts older than the daily freshness window", () => {
    installWindow();
    const nowMs = Date.now();
    const staleCachedAt =
      nowMs - weatherSnapshotCacheInternals.MAX_SNAPSHOT_AGE_MS - 1;

    writeCachedWeatherSnapshot({
      coordinates: { latitude: 41.8781, longitude: -87.6298 },
      weather: buildWeather("stale"),
      cachedAt: staleCachedAt,
    });

    const snapshot = readCachedWeatherSnapshot(
      { latitude: 41.8781, longitude: -87.6298 },
      { nowMs }
    );

    assert.equal(snapshot, null);
  });

  test("does not restore snapshots stamped in the future (clock moved)", () => {
    installWindow();
    const nowMs = Date.now();
    // Clamping a future timestamp's age to zero would make a
    // corrupt/clock-skewed snapshot read as perpetually fresh.
    const futureCachedAt = nowMs + 10 * 60 * 1000;

    writeCachedWeatherSnapshot({
      coordinates: { latitude: 41.8781, longitude: -87.6298 },
      weather: buildWeather("future"),
      cachedAt: futureCachedAt,
    });

    const snapshot = readCachedWeatherSnapshot(
      { latitude: 41.8781, longitude: -87.6298 },
      { nowMs }
    );

    assert.equal(snapshot, null);
  });

  test("tolerates small clock jitter on freshly written snapshots", () => {
    installWindow();
    const nowMs = Date.now();
    const slightlyAhead = nowMs + 30 * 1000;

    writeCachedWeatherSnapshot({
      coordinates: { latitude: 41.8781, longitude: -87.6298 },
      weather: buildWeather("jitter"),
      cachedAt: slightlyAhead,
    });

    const snapshot = readCachedWeatherSnapshot(
      { latitude: 41.8781, longitude: -87.6298 },
      { nowMs }
    );

    assert.notEqual(snapshot, null);
  });
});
