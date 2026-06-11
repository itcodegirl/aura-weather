// src/hooks/weatherRefreshPolicy.js
//
// Pure decision logic for the dashboard's automatic refresh triggers
// (connectivity returning, tab becoming visible again). Kept separate
// from the effect wiring in useWeatherData so the policy is directly
// unit-testable.

import { toFiniteNumber } from "../utils/numbers.js";

// A forecast older than this is considered stale enough to refresh
// without being asked when the app gets a natural opportunity (tab
// shown again, connection restored). Half an hour matches the cadence
// of Open-Meteo's model updates closely enough for daily planning.
export const AUTO_REFRESH_STALE_AFTER_MS = 30 * 60 * 1000;

// Floor between automatic attempts so a flapping connection or rapid
// tab switching cannot hammer the provider.
export const AUTO_REFRESH_MIN_INTERVAL_MS = 60 * 1000;

/**
 * Decides whether an automatic forecast refresh should fire.
 *
 * Returns true when the app is visible and online, hasn't auto-tried
 * too recently, and either has no trustworthy data (error, restored
 * cache, never fetched) or the live data has aged past the staleness
 * threshold.
 */
export function shouldAutoRefreshWeather({
  nowMs,
  weatherFetchedAt,
  forecastStatus,
  hasError = false,
  isOffline = false,
  isVisible = true,
  lastAttemptAt = null,
  staleAfterMs = AUTO_REFRESH_STALE_AFTER_MS,
  minAttemptIntervalMs = AUTO_REFRESH_MIN_INTERVAL_MS,
} = {}) {
  const now = toFiniteNumber(nowMs);
  if (now === null || isOffline || !isVisible) {
    return false;
  }

  const lastAttempt = toFiniteNumber(lastAttemptAt);
  if (lastAttempt !== null && now - lastAttempt < minAttemptIntervalMs) {
    return false;
  }

  // An error or a restored-cache state means the screen is not showing
  // live data; any natural opportunity should try to recover.
  if (hasError || forecastStatus === "cached") {
    return true;
  }

  const fetchedAt = toFiniteNumber(weatherFetchedAt);
  if (fetchedAt === null) {
    // Never fetched (e.g. first load raced offline). Only refresh once
    // a fetch actually settled — "idle"/"loading" boots are owned by
    // the normal request lifecycle, not the auto-refresh path.
    return forecastStatus === "ready" || forecastStatus === "cached";
  }

  return now - fetchedAt >= staleAfterMs;
}
