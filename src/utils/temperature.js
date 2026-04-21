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

export function convertTemp(value, targetUnit, sourceUnit = targetUnit) {
  return convertTemperature(value, targetUnit, sourceUnit);
}
