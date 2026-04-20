export const WIND_SPEED_CONVERSION = 1.60934;

function normalizeUnit(unit) {
  return unit === "C" ? "C" : "F";
}

export function formatWindSpeed(speed, targetUnit, sourceUnit = "F") {
  const rounded = Number(speed);
  if (!Number.isFinite(rounded)) {
    return "\u2014";
  }

  const normalizedSource = normalizeUnit(sourceUnit);
  const normalizedTarget = normalizeUnit(targetUnit);
  const isMphSource = normalizedSource === "F";
  const speedInMph = isMphSource ? rounded : rounded / WIND_SPEED_CONVERSION;
  const converted =
    normalizedTarget === "C"
      ? Math.round(speedInMph * WIND_SPEED_CONVERSION)
      : Math.round(speedInMph);

  return `${converted} ${normalizedTarget === "C" ? "km/h" : "mph"}`;
}
