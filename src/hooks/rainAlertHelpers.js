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
