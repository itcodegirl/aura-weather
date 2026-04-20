export const WIND_SPEED_CONVERSION = 1.60934;

export function formatWindSpeed(speed, unit) {
  const rounded = Number(speed);
  if (!Number.isFinite(rounded)) {
    return "\u2014";
  }

  const converted =
    unit === "C" ? Math.round(rounded * WIND_SPEED_CONVERSION) : Math.round(rounded);
  return `${converted} ${unit === "C" ? "km/h" : "mph"}`;
}
