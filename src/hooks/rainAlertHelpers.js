import { toFiniteNumber } from "../utils/numbers.js";

/**
 * True when a stored alert rule points at the same place as the active
 * location, within a ~11 m tolerance (1e-4 degrees). Rule rows are
 * external data — they arrive from the backend — so their coordinates
 * go through toFiniteNumber like every other provider value: a
 * malformed row with null coordinates must match nothing. Raw
 * Number(null) is 0, which would pin such a rule to (0, 0) Null Island
 * and let it shadow a real location near the equator or prime meridian.
 */
export function sameLocation(rule, location) {
  const ruleLat = toFiniteNumber(rule?.location_lat);
  const ruleLon = toFiniteNumber(rule?.location_lon);
  const lat = toFiniteNumber(location?.lat);
  const lon = toFiniteNumber(location?.lon);
  if (ruleLat === null || ruleLon === null || lat === null || lon === null) {
    return false;
  }
  return Math.abs(ruleLat - lat) < 1e-4 && Math.abs(ruleLon - lon) < 1e-4;
}

/**
 * Request-lifecycle discipline for the alert-state loads, mirroring what
 * useWeatherData already does for forecasts: every load takes a ticket,
 * starting a new one aborts the previous request, and only the newest
 * ticket may write state.
 *
 * Both guards are needed and neither replaces the other. The abort stops
 * the Supabase rule query for a location the user has already left. The
 * id guard covers what abort cannot: getExistingSubscription reads the
 * service worker's PushManager, which takes no signal, so a superseded
 * call still resolves — its result is discarded rather than applied over
 * the newer location's state.
 */
export function createAlertRequestTracker() {
  let currentId = 0;
  let controller = null;

  return {
    /** Supersedes any in-flight load and returns the new ticket. */
    start() {
      currentId += 1;
      if (controller) controller.abort();
      controller =
        typeof AbortController === "undefined" ? null : new AbortController();
      return { id: currentId, signal: controller?.signal };
    },
    /** True only for the most recently issued ticket. */
    isCurrent(id) {
      return id === currentId;
    },
    /**
     * Abandons the in-flight load without issuing a ticket — for unmount.
     * Bumps the id too, so a request that resolves after teardown fails
     * isCurrent and cannot write state.
     */
    abort() {
      currentId += 1;
      if (controller) controller.abort();
      controller = null;
    },
  };
}
