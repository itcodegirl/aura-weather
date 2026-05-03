import {
  convertTemperature,
  toFahrenheit,
  toCelsius,
  normalizeTemperatureUnit,
  formatTemperature,
} from "../domain/temperature.js";
import { toFiniteNumber } from "./numbers.js";

export {
  convertTemperature,
  toFahrenheit,
  toCelsius,
  normalizeTemperatureUnit,
  formatTemperature,
};

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
