export const SOURCE_TEMPERATURE_UNIT = "F";

function toFiniteTemperature(value) {
  // Reject null/undefined explicitly — Number(null) is 0, which would
  // produce a fake "65°F warmer than average" comparison when the
  // archive returns no usable sample.
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Combines a forecast snapshot with a historical archive sample to
 * produce a comparison object. Returns null when either side is
 * missing or non-finite, so the UI can fall back without ambiguity.
 */
export function buildClimateComparison(weatherData, historicalAverage) {
  if (!historicalAverage) {
    return null;
  }

  const currentTemperature = toFiniteTemperature(
    weatherData?.current?.temperature
  );
  const historicalTemperature = toFiniteTemperature(
    historicalAverage?.averageTemperature
  );

  if (currentTemperature === null || historicalTemperature === null) {
    return null;
  }

  return {
    ...historicalAverage,
    difference: currentTemperature - historicalTemperature,
    differenceUnit: SOURCE_TEMPERATURE_UNIT,
  };
}
