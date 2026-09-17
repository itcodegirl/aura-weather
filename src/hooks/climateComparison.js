import { resolveTodayIndex } from "../domain/forecastToday.js";
import { toFiniteNumber } from "../utils/numbers.js";

export const SOURCE_TEMPERATURE_UNIT = "F";

// Reject null/undefined explicitly — Number(null) is 0, which would
// produce a fake "65°F warmer than average" comparison when the
// archive returns no usable sample.
const toFiniteTemperature = toFiniteNumber;

/**
 * Combines a forecast with the historical archive sample to produce a
 * comparison object. Returns null when either side is missing or
 * non-finite, so the UI can fall back without ambiguity.
 *
 * Like with like: today's forecast high against the 30-year average of
 * the daily high for this calendar day. This compared the instantaneous
 * current temperature with the average of the daily *mean*, so afternoons
 * read "warmer than average" and nights "colder" whatever the anomaly —
 * the 5°F gate downstream only hid that on mild days. The high is read at
 * today's daily entry (resolveTodayIndex), not index 0, so a snapshot
 * restored from yesterday compares today's high, not yesterday's.
 *
 * `nowMs` is the caller's clock; without one the day falls back to index
 * 0, as resolveTodayIndex does everywhere else.
 */
export function buildClimateComparison(weatherData, historicalAverage, nowMs) {
  if (!historicalAverage) {
    return null;
  }

  // "14°F above the 30-year average for this date" is a claim about TODAY.
  // On a run-out series it was a claim about an April day made in September,
  // and no relabelling fixes an anomaly — so there is nothing to compare.
  const { index: todayIndex, status } = resolveTodayIndex(weatherData, nowMs);
  if (status === "stale") {
    return null;
  }

  const todayHighTemperature = toFiniteTemperature(
    weatherData?.daily?.temperatureMax?.[todayIndex]
  );
  const historicalHighTemperature = toFiniteTemperature(
    historicalAverage?.averageHighTemperature
  );

  if (todayHighTemperature === null || historicalHighTemperature === null) {
    return null;
  }

  return {
    ...historicalAverage,
    todayHighTemperature,
    difference: todayHighTemperature - historicalHighTemperature,
    differenceUnit: SOURCE_TEMPERATURE_UNIT,
  };
}
