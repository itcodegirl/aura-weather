// src/api/forecastPreload.js
//
// Boot-time forecast head start. main.jsx fires the first forecast
// request *before* React mounts, so its network round-trip overlaps
// app-shell hydration instead of waiting for the first effect to run.
// useWeatherData adopts that in-flight request when its first fetch
// targets the same coordinates (claimForecastPreload); on a miss it
// fetches as usual, so this is a pure head start with no behavioural
// change. The win is largest on a cold load over a weak connection,
// where the request RTT dominates time-to-data.

import { fetchWeather } from "./openMeteo.js";
import {
  getApiPrecipUnit,
  getApiWindSpeedUnit,
  parseCoordinates,
} from "../utils/weatherUnits.js";

// Forecast data is always fetched in Fahrenheit/inch units and converted
// client-side (this mirrors useWeatherData), so a display-unit toggle
// never forces a refetch — and these params are a deterministic match
// for the hook's first request, which is what makes the claim reliable.
const WEATHER_SOURCE_UNIT = "F";
const API_TEMPERATURE_UNIT = "fahrenheit";

let pendingPreload = null;

function resolveCoordinateKey(coordinates) {
  const parsed = parseCoordinates(
    coordinates?.latitude,
    coordinates?.longitude
  );
  if (!parsed) {
    return null;
  }
  return { parsed, key: `${parsed.latitude},${parsed.longitude}` };
}

/**
 * The exact forecast request options useWeatherData uses for its first
 * fetch. Exported so the boot path and tests build identical params.
 */
export function getForecastRequestOptions() {
  return {
    temperatureUnit: API_TEMPERATURE_UNIT,
    windSpeedUnit: getApiWindSpeedUnit(),
    precipitationUnit: getApiPrecipUnit(WEATHER_SOURCE_UNIT),
  };
}

/**
 * Starts the forecast request for the given boot coordinates and stashes
 * the in-flight promise for useWeatherData to adopt. Returns the promise
 * (or null when coordinates are invalid / fetch is unavailable).
 */
export function startForecastPreload(coordinates, options) {
  if (typeof fetch !== "function") {
    return null;
  }
  const resolved = resolveCoordinateKey(coordinates);
  if (!resolved) {
    return null;
  }
  // Idempotent for the same coordinates: a duplicate boot call keeps the
  // first in-flight request rather than firing a second one.
  if (pendingPreload && pendingPreload.key === resolved.key) {
    return pendingPreload.promise;
  }

  const promise = fetchWeather(
    resolved.parsed.latitude,
    resolved.parsed.longitude,
    options ?? getForecastRequestOptions()
  );
  // A preload that is never claimed (e.g. the user relocates before the
  // first effect runs) must not surface as an unhandled rejection. A
  // claimer attaches its own handler and still receives the rejection.
  promise.catch(() => {});
  pendingPreload = { key: resolved.key, promise };
  return promise;
}

/**
 * Hands the boot preload to useWeatherData's first matching request.
 * Returns the in-flight promise once (then clears it) when coordinates
 * match, otherwise null so the caller fetches normally. The promise
 * carries no abort signal; useWeatherData's requestId guard still
 * discards its result if a newer request superseded it.
 */
export function claimForecastPreload(coordinates) {
  if (!pendingPreload) {
    return null;
  }
  const resolved = resolveCoordinateKey(coordinates);
  if (!resolved || resolved.key !== pendingPreload.key) {
    return null;
  }
  const { promise } = pendingPreload;
  pendingPreload = null;
  return promise;
}

/** Test-only: clears any pending preload so suites stay isolated. */
export function resetForecastPreloadForTests() {
  pendingPreload = null;
}
