export const WIND_SPEED_CONVERSION = 1.60934;
export const MM_PER_INCH = 25.4;
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

const PRECIP_LABEL_BY_UNIT = {
  F: "in",
  C: "mm",
};

function normalizeBool(value) {
  if (typeof value !== "string") {
    return "F";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "C" || normalized === "CELSIUS") {
    return "C";
  }
  if (normalized === "F" || normalized === "FAHRENHEIT") {
    return "F";
  }

  return "F";
}

function normalizeCoordinate(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < min || numeric > max) {
    return null;
  }
  return numeric;
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
  return normalizeCoordinate(value, MIN_LATITUDE, MAX_LATITUDE);
}

export function normalizeLongitude(value) {
  return normalizeCoordinate(value, MIN_LONGITUDE, MAX_LONGITUDE);
}

export function parseCoordinates(lat, lon) {
  const latitude = normalizeLatitude(lat);
  const longitude = normalizeLongitude(lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function validateCoordinates(lat, lon) {
  const parsed = parseCoordinates(lat, lon);
  if (!parsed) {
    throw new Error("Invalid coordinates");
  }
  return parsed;
}

export function toFahrenheit(value, sourceUnit = "F") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const normalizedSource = normalizeBool(sourceUnit);
  return normalizedSource === "C" ? (numeric * 9) / 5 + 32 : numeric;
}

export function toCelsius(value, sourceUnit = "F") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const normalizedSource = normalizeBool(sourceUnit);
  return normalizedSource === "F" ? ((numeric - 32) * 5) / 9 : numeric;
}

export function formatWindSpeed(speed, targetUnit, sourceUnit = "F") {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric)) {
    return "\u2014";
  }
  const nonNegativeSpeed = Math.max(numeric, 0);

  const sourceNormalized = normalizeBool(sourceUnit);
  const targetNormalized = normalizeBool(targetUnit);
  const speedInMph =
    sourceNormalized === "F"
      ? nonNegativeSpeed
      : nonNegativeSpeed / WIND_SPEED_CONVERSION;
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
  const nonNegativeValue = Math.max(numeric, 0);

  const sourceNormalized = normalizeBool(sourceUnit);
  const targetNormalized = normalizeBool(targetUnit);
  const valueInInches =
    sourceNormalized === "C"
      ? nonNegativeValue / MM_PER_INCH
      : nonNegativeValue;
  const displayValue =
    targetNormalized === "C" ? valueInInches * MM_PER_INCH : valueInInches;

  return `${displayValue.toFixed(2)} ${getPrecipUnitLabel(targetNormalized)}`;
}
