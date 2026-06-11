import { toFiniteNumber } from "../utils/numbers.js";

const CACHE_KEY = "aura-weather-last-known-forecast-v1";
const CACHE_VERSION = 1;
const MAX_CACHED_LOCATIONS = 8;
const MAX_SNAPSHOT_AGE_MS = 12 * 60 * 60 * 1000;
// Snapshots stamped meaningfully in the future mean the device clock
// moved (or the payload is corrupt); clamping their age to zero would
// present them as perpetually fresh. A small slack absorbs ordinary
// clock jitter.
const FUTURE_SNAPSHOT_SLACK_MS = 5 * 60 * 1000;

function getStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeCoordinates(coordinates) {
  const latitude = toFiniteNumber(coordinates?.latitude);
  const longitude = toFiniteNumber(coordinates?.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function getSnapshotKey(coordinates) {
  const normalized = normalizeCoordinates(coordinates);
  if (!normalized) {
    return null;
  }

  return `${normalized.latitude.toFixed(4)},${normalized.longitude.toFixed(4)}`;
}

function readCachePayload() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== CACHE_VERSION ||
      !parsed.snapshots ||
      typeof parsed.snapshots !== "object"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isQuotaExceededError(error) {
  if (!error) {
    return false;
  }
  if (error.name === "QuotaExceededError") {
    return true;
  }
  // Firefox legacy code; some browsers set only the numeric code.
  return error.code === 22 || error.code === 1014;
}

function writeCachePayload(payload) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(CACHE_KEY, JSON.stringify(payload));
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      // Storage can fail in private browsing or locked-down embeds for
      // reasons other than quota; nothing we can do, drop silently.
      return;
    }
  }

  // Quota pressure: drop the oldest snapshot (the existing eviction
  // sort already keeps newest-first, so the tail entry is the one to
  // evict) and try once more. If that still fails, give up rather
  // than loop — repeated quota errors mean a foreign actor is
  // saturating localStorage and we should yield gracefully.
  const entries = Object.entries(payload?.snapshots ?? {});
  if (entries.length <= 1) {
    return;
  }

  const trimmed = {
    ...payload,
    snapshots: Object.fromEntries(entries.slice(0, -1)),
  };

  try {
    storage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Best-effort. A second failure means the cache is unrecoverable
    // for now; the next write attempt will retry.
  }
}

function hasUsableSnapshotShape(snapshot) {
  return Boolean(
    snapshot &&
      typeof snapshot === "object" &&
      snapshot.version === CACHE_VERSION &&
      toFiniteNumber(snapshot.cachedAt) !== null &&
      snapshot.weather &&
      typeof snapshot.weather === "object" &&
      normalizeCoordinates(snapshot.coordinates)
  );
}

function isFreshSnapshot(snapshot, nowMs = Date.now(), maxAgeMs = MAX_SNAPSHOT_AGE_MS) {
  if (!hasUsableSnapshotShape(snapshot)) {
    return false;
  }

  const cachedAt = toFiniteNumber(snapshot.cachedAt);
  const now = toFiniteNumber(nowMs) ?? Date.now();
  const rawAgeMs = now - cachedAt;
  if (rawAgeMs < -FUTURE_SNAPSHOT_SLACK_MS) {
    return false;
  }
  const ageMs = Math.max(0, rawAgeMs);
  return ageMs <= maxAgeMs;
}

export function readCachedWeatherSnapshot(coordinates, options = {}) {
  const key = getSnapshotKey(coordinates);
  if (!key) {
    return null;
  }

  // Callers can widen the freshness window (options.maxAgeMs) for
  // degraded paths — offline starts and failed refreshes — where an
  // honestly-labelled old forecast beats an error screen. The default
  // stays conservative so the happy path never renders stale numbers.
  const maxAgeMs = toFiniteNumber(options.maxAgeMs) ?? MAX_SNAPSHOT_AGE_MS;
  const payload = readCachePayload();
  const snapshot = payload?.snapshots?.[key] ?? null;

  if (!isFreshSnapshot(snapshot, options.nowMs, maxAgeMs)) {
    return null;
  }

  return snapshot;
}

export function writeCachedWeatherSnapshot({
  coordinates,
  weather,
  trustMeta,
  cachedAt = Date.now(),
}) {
  const normalizedCoordinates = normalizeCoordinates(coordinates);
  const key = getSnapshotKey(normalizedCoordinates);

  if (!key || !weather || typeof weather !== "object") {
    return;
  }

  const payload = readCachePayload() ?? {
    version: CACHE_VERSION,
    snapshots: {},
  };

  const nextSnapshots = {
    ...payload.snapshots,
    [key]: {
      version: CACHE_VERSION,
      cachedAt,
      coordinates: normalizedCoordinates,
      weather,
      trustMeta: trustMeta && typeof trustMeta === "object" ? trustMeta : {},
    },
  };

  const entries = Object.entries(nextSnapshots)
    .filter(([, snapshot]) => hasUsableSnapshotShape(snapshot))
    .sort(([, a], [, b]) => {
      const aCachedAt = toFiniteNumber(a.cachedAt) ?? 0;
      const bCachedAt = toFiniteNumber(b.cachedAt) ?? 0;
      return bCachedAt - aCachedAt;
    })
    .slice(0, MAX_CACHED_LOCATIONS);

  writeCachePayload({
    version: CACHE_VERSION,
    snapshots: Object.fromEntries(entries),
  });
}

export const weatherSnapshotCacheInternals = {
  CACHE_KEY,
  CACHE_VERSION,
  MAX_SNAPSHOT_AGE_MS,
  getSnapshotKey,
};
