export const WIND_SPEED_CONVERSION = 1.60934;
export const MM_PER_INCH = 25.4;

const PRECIP_LABEL_BY_UNIT = {
  F: "in",
  C: "mm",
};

function normalizeBool(value) {
  return value === "C" ? "C" : "F";
}

export function normalizeTemperatureUnit(value) {
  return normalizeBool(value);
}

export function getApiTemperatureUnit(unit) {
  return normalizeBool(unit) === "C" ? "celsius" : "fahrenheit";
}

export function getApiWindSpeedUnit(unit) {
  return normalizeBool(unit) === "C" ? "kmh" : "mph";
}

export function getApiPrecipUnit(unit) {
  return normalizeBool(unit) === "C" ? "mm" : "inch";
}

export function getPrecipUnitLabel(unit) {
  return PRECIP_LABEL_BY_UNIT[normalizeBool(unit)];
}

export function normalizeLatitude(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeLongitude(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function toFahrenheit(value, sourceUnit = "F") {
  if (!Number.isFinite(value)) return value;
  const normalizedSource = normalizeBool(sourceUnit);
  return normalizedSource === "C" ? (value * 9) / 5 + 32 : value;
}

export function toCelsius(value, sourceUnit = "F") {
  if (!Number.isFinite(value)) return value;
  const normalizedSource = normalizeBool(sourceUnit);
  return normalizedSource === "F" ? ((value - 32) * 5) / 9 : value;
}

export function formatWindSpeed(speed, targetUnit, sourceUnit = "F") {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric)) {
    return "\u2014";
  }

  const sourceNormalized = normalizeBool(sourceUnit);
  const targetNormalized = normalizeBool(targetUnit);
  const speedInMph =
    sourceNormalized === "F" ? numeric : numeric / WIND_SPEED_CONVERSION;
  const converted =
    targetNormalized === "C"
      ? Math.round(speedInMph * WIND_SPEED_CONVERSION)
      : Math.round(speedInMph);

  return `${converted} ${targetNormalized === "C" ? "km/h" : "mph"}`;
}

export function formatPrecipitation(value, targetUnit, sourceUnit = "F") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "\u2014";
  }

  const sourceNormalized = normalizeBool(sourceUnit);
  const targetNormalized = normalizeBool(targetUnit);
  const valueInInches =
    sourceNormalized === "C" ? numeric / MM_PER_INCH : numeric;
  const displayValue =
    targetNormalized === "C" ? valueInInches * MM_PER_INCH : valueInInches;

  return `${displayValue.toFixed(2)} ${getPrecipUnitLabel(targetNormalized)}`;
}
