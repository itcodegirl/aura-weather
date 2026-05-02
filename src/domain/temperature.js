const DEFAULT_UNIT = "F";

export function normalizeTemperatureUnit(value) {
  if (typeof value !== "string") {
    return DEFAULT_UNIT;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "C" || normalized === "CELSIUS") {
    return "C";
  }
  if (normalized === "F" || normalized === "FAHRENHEIT") {
    return "F";
  }

  return DEFAULT_UNIT;
}

// Strict numeric guard so a null/undefined/empty input cannot be
// silently coerced to 0 — which previously surfaced as a fake 0°F /
// 0°C reading whenever Open-Meteo skipped a temperature field.
function toNumericOrNaN(value) {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "string" && value.trim() === "") return Number.NaN;
  if (typeof value === "boolean" || typeof value === "object") return Number.NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

export function toFahrenheit(value, sourceUnit = DEFAULT_UNIT) {
  const numeric = toNumericOrNaN(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const normalizedSource = normalizeTemperatureUnit(sourceUnit);
  return normalizedSource === "C" ? (numeric * 9) / 5 + 32 : numeric;
}

export function toCelsius(value, sourceUnit = DEFAULT_UNIT) {
  const numeric = toNumericOrNaN(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const normalizedSource = normalizeTemperatureUnit(sourceUnit);
  return normalizedSource === "F" ? ((numeric - 32) * 5) / 9 : numeric;
}

export function convertTemperature(
  value,
  targetUnit = DEFAULT_UNIT,
  sourceUnit = DEFAULT_UNIT
) {
  const normalizedTarget = normalizeTemperatureUnit(targetUnit);
  return normalizedTarget === "C"
    ? toCelsius(value, sourceUnit)
    : toFahrenheit(value, sourceUnit);
}

export function formatTemperature(
  value,
  unit = DEFAULT_UNIT,
  sourceUnit = DEFAULT_UNIT
) {
  const converted = convertTemperature(value, unit, sourceUnit);
  if (!Number.isFinite(converted)) {
    return "\u2014";
  }
  const normalizedUnit = normalizeTemperatureUnit(unit);
  return `${Math.round(converted)}\u00B0${normalizedUnit}`;
}

