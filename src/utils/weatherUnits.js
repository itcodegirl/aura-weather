import { normalizeTemperatureUnit as normalizeDomainTemperatureUnit } from "../domain/temperature.js";
import { toFiniteNumber } from "./numbers.js";

export { toFahrenheit, toCelsius, convertTemperature } from "../domain/temperature.js";
export { WIND_SPEED_CONVERSION, formatWindSpeed } from "../domain/wind.js";

export const MM_PER_INCH = 25.4;
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

const PRECIP_LABEL_BY_UNIT = {
  F: "in",
  C: "mm",
};

function normalizeCoordinate(value, min, max) {
  // toFiniteNumber rejects null/undefined/empty/boolean/object — so a
  // missing coords field cannot quietly resolve to (0, 0) Null Island.
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }
  if (numeric < min || numeric > max) {
    return null;
  }
  return numeric;
}

export function normalizeTemperatureUnit(value) {
  return normalizeDomainTemperatureUnit(value);
}

export function getApiTemperatureUnit(unit) {
  return normalizeDomainTemperatureUnit(unit) === "C" ? "celsius" : "fahrenheit";
}

export function getApiWindSpeedUnit() {
  return "mph";
}

export function getApiPrecipUnit(unit) {
  return normalizeDomainTemperatureUnit(unit) === "C" ? "mm" : "inch";
}

export function getPrecipUnitLabel(unit) {
  return PRECIP_LABEL_BY_UNIT[normalizeDomainTemperatureUnit(unit)];
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

export function formatPrecipitation(value, targetUnit, sourceUnit = "F") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "\u2014";
  }
  const nonNegativeValue = Math.max(numeric, 0);

  const sourceNormalized = normalizeDomainTemperatureUnit(sourceUnit);
  const targetNormalized = normalizeDomainTemperatureUnit(targetUnit);
  const valueInInches =
    sourceNormalized === "C"
      ? nonNegativeValue / MM_PER_INCH
      : nonNegativeValue;
  const displayValue =
    targetNormalized === "C" ? valueInInches * MM_PER_INCH : valueInInches;

  return `${displayValue.toFixed(2)} ${getPrecipUnitLabel(targetNormalized)}`;
}
