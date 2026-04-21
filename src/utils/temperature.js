import {
  convertTemperature,
  toFahrenheit,
  toCelsius,
  normalizeTemperatureUnit,
  formatTemperature,
} from "../domain/temperature.js";

export {
  convertTemperature,
  toFahrenheit,
  toCelsius,
  normalizeTemperatureUnit,
  formatTemperature,
};

export function convertTemp(fahrenheit, unit) {
  if (unit === "F") {
    return Math.round(fahrenheit);
  }
  return Math.round(((fahrenheit - 32) * 5) / 9);
}
