import { MISSING_VALUE_PLACEHOLDER, toFiniteNumber } from "./numbers.js";

// The Open-Meteo forecast comes back in Fahrenheit; convertTemp turns
// that into the user's chosen display unit. Returns NaN (not 0) for
// missing input so consumers can fall back to "—" instead of fake
// "0°F" / "0°C" readings.
export function convertTemp(fahrenheit, unit) {
  const numeric = toFiniteNumber(fahrenheit);
  if (numeric === null) return Number.NaN;
  if (unit === "F") {
    return Math.round(numeric);
  }
  return Math.round(((numeric - 32) * 5) / 9);
}

/**
 * Returns the rounded temperature value for display, or the missing
 * placeholder when the input cannot be parsed. Intended for cases
 * where the unit suffix is rendered separately (e.g. via a styled
 * <span>).
 */
export function formatTemperatureValue(fahrenheit, unit) {
  const converted = convertTemp(fahrenheit, unit);
  return Number.isFinite(converted) ? String(converted) : MISSING_VALUE_PLACEHOLDER;
}

/**
 * Returns "65°F" for a valid input or "—" for missing input. The unit
 * suffix is intentionally suppressed on the missing path so the UI
 * never renders the misleading "—°F" string.
 */
export function formatTemperatureWithUnit(fahrenheit, unit) {
  const value = formatTemperatureValue(fahrenheit, unit);
  if (value === MISSING_VALUE_PLACEHOLDER) {
    return value;
  }
  return `${value}${unit === "C" ? "°C" : "°F"}`;
}
