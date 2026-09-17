import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toFiniteNumber } from "../utils/numbers.js";

/*
 * The climate line's other half is a 30-year normal: the average daily
 * high for one calendar day at one place. It changes only when the year
 * rolls over and the 30-year window moves with it. The app fetched it
 * again on every city switch and every fresh forecast — 30 years of
 * daily rows each time, the largest request in the app, for one sentence.
 *
 * This keeps the answer in localStorage, keyed by rounded coordinates,
 * month-day, year and unit. A hit costs no request and works offline; a
 * miss falls through to the archive exactly as before. Nothing here is
 * trusted beyond its shape: a corrupt or foreign payload reads as empty,
 * and a value that is not a finite number is not a climatology.
 */

const CACHE_KEY = "aura-weather-climatology-v1";
const CACHE_VERSION = 1;
// Eight saved cities and a few days each; more than that is churn.
const MAX_ENTRIES = 64;
// The year check is what expires an entry; this is the backstop for a
// device clock that has wandered, so a stale normal cannot outlive a
// forgotten `year` field.
const MAX_ENTRY_AGE_MS = 400 * 24 * 60 * 60 * 1000;
// An entry stamped meaningfully in the future means the clock moved or
// the payload is corrupt. A small slack absorbs ordinary jitter.
const FUTURE_ENTRY_SLACK_MS = 5 * 60 * 1000;

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

/**
 * Which calendar day the climatology is for, in the location's zone —
 * the same day fetchHistoricalTemperatureAverage builds its 30-year
 * window around. Null without a usable clock.
 */
export function describeClimatologyTarget(timeZone, nowMs = Date.now()) {
  const reference = toFiniteNumber(nowMs);
  if (reference === null) {
    return null;
  }
  const isoDate = getIsoDateInTimeZone(timeZone, new Date(reference));
  const year = Number(isoDate.slice(0, 4));
  const monthDay = isoDate.slice(5, 10);
  if (!Number.isFinite(year) || !/^\d{2}-\d{2}$/.test(monthDay)) {
    return null;
  }
  return { year, monthDay };
}

function getEntryKey({ coordinates, monthDay, temperatureUnit }) {
  const latitude = toFiniteNumber(coordinates?.latitude);
  const longitude = toFiniteNumber(coordinates?.longitude);
  if (
    latitude === null ||
    longitude === null ||
    typeof monthDay !== "string" ||
    !/^\d{2}-\d{2}$/.test(monthDay) ||
    typeof temperatureUnit !== "string" ||
    !temperatureUnit
  ) {
    return null;
  }
  // Two decimals is about a kilometre — well inside the archive's 9 to
  // 25 km grid, so a city's searched and located coordinates share one
  // entry rather than fetching the same normal twice.
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}|${monthDay}|${temperatureUnit}`;
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
      !parsed.entries ||
      typeof parsed.entries !== "object"
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
      // Private browsing or a locked-down embed; nothing to do.
      return;
    }
  }

  // Quota pressure: entries are kept newest-first, so drop the tail and
  // try once more. A second failure means the cache is unrecoverable for
  // now; the next write will try again.
  const entries = Object.entries(payload?.entries ?? {});
  if (entries.length <= 1) {
    return;
  }
  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...payload, entries: Object.fromEntries(entries.slice(0, -1)) })
    );
  } catch {
    // Best-effort.
  }
}

function hasUsableEntryShape(entry) {
  return Boolean(
    entry &&
      typeof entry === "object" &&
      entry.version === CACHE_VERSION &&
      toFiniteNumber(entry.storedAt) !== null &&
      toFiniteNumber(entry.year) !== null &&
      toFiniteNumber(entry.averageHighTemperature) !== null
  );
}

function isLiveEntry(entry, year, nowMs) {
  if (!hasUsableEntryShape(entry)) {
    return false;
  }
  // The 30-year window is anchored to the current year; a new year moves
  // it, so last year's normal for this date is a different number.
  if (toFiniteNumber(entry.year) !== toFiniteNumber(year)) {
    return false;
  }
  const now = toFiniteNumber(nowMs) ?? Date.now();
  const rawAgeMs = now - toFiniteNumber(entry.storedAt);
  if (rawAgeMs < -FUTURE_ENTRY_SLACK_MS) {
    return false;
  }
  return Math.max(0, rawAgeMs) <= MAX_ENTRY_AGE_MS;
}

/**
 * The stored climatology for a place, calendar day, year and unit, in
 * the shape fetchHistoricalTemperatureAverage returns — or null.
 */
export function readCachedClimatology(
  { coordinates, monthDay, year, temperatureUnit },
  nowMs = Date.now()
) {
  const key = getEntryKey({ coordinates, monthDay, temperatureUnit });
  if (!key) {
    return null;
  }

  const entry = readCachePayload()?.entries?.[key] ?? null;
  if (!isLiveEntry(entry, year, nowMs)) {
    return null;
  }

  return {
    averageHighTemperature: toFiniteNumber(entry.averageHighTemperature),
    averageTemperatureUnit: entry.averageTemperatureUnit,
    sampleYears: toFiniteNumber(entry.sampleYears),
    referenceDateLabel:
      typeof entry.referenceDateLabel === "string" ? entry.referenceDateLabel : "",
    timeRange: typeof entry.timeRange === "string" ? entry.timeRange : "",
  };
}

export function writeCachedClimatology(
  { coordinates, monthDay, year, temperatureUnit, historicalAverage },
  storedAt = Date.now()
) {
  const key = getEntryKey({ coordinates, monthDay, temperatureUnit });
  const averageHighTemperature = toFiniteNumber(
    historicalAverage?.averageHighTemperature
  );
  const entryYear = toFiniteNumber(year);
  if (!key || averageHighTemperature === null || entryYear === null) {
    return;
  }

  const payload = readCachePayload() ?? { version: CACHE_VERSION, entries: {} };
  const nextEntries = {
    ...payload.entries,
    [key]: {
      version: CACHE_VERSION,
      storedAt,
      year: entryYear,
      averageHighTemperature,
      averageTemperatureUnit: historicalAverage.averageTemperatureUnit,
      sampleYears: toFiniteNumber(historicalAverage.sampleYears),
      referenceDateLabel: historicalAverage.referenceDateLabel,
      timeRange: historicalAverage.timeRange,
    },
  };

  const entries = Object.entries(nextEntries)
    .filter(([, entry]) => hasUsableEntryShape(entry))
    .sort(([, a], [, b]) => {
      const aStoredAt = toFiniteNumber(a.storedAt) ?? 0;
      const bStoredAt = toFiniteNumber(b.storedAt) ?? 0;
      return bStoredAt - aStoredAt;
    })
    .slice(0, MAX_ENTRIES);

  writeCachePayload({
    version: CACHE_VERSION,
    entries: Object.fromEntries(entries),
  });
}

export const climatologyCacheInternals = {
  CACHE_KEY,
  CACHE_VERSION,
  MAX_ENTRIES,
  MAX_ENTRY_AGE_MS,
  getEntryKey,
};
