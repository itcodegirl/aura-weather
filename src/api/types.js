// src/api/types.js

/**
 * @typedef {{latitude: number|null, longitude: number|null, timezone: string}} WeatherMeta
 * @typedef {{
 *   temperature: number|null,
 *   humidity: number|null,
 *   feelsLike: number|null,
 *   conditionCode: number|null,
 *   windSpeed: number|null,
 *   windGust: number|null,
 *   windDirection: number|null,
 *   pressure: number|null,
 *   dewPoint: number|null,
 *   cloudCover: number|null,
 *   visibility: number|null
 * }} WeatherCurrent
 * @typedef {{
 *   time: string[],
 *   temperature: number[],
 *   conditionCode: number[],
 *   rainChance: number[],
 *   rainAmount: number[],
 *   pressure: number[],
 *   cape: number[],
 *   windGust: number[]
 * }} WeatherHourly
 * @typedef {{
 *   time: string[],
 *   conditionCode: number[],
 *   temperatureMax: number[],
 *   temperatureMin: number[],
 *   sunrise: string[],
 *   sunset: string[],
 *   uvIndexMax: number[],
 *   rainChanceMax: number[],
 *   rainAmountTotal: number[]
 * }} WeatherDaily
 * @typedef {{
 *   time: string[],
 *   conditionCode: number[],
 *   rainChance: number[],
 *   rainAmount: number[]
 * }} WeatherNowcast
 * @typedef {{
 *   meta: WeatherMeta,
 *   current: WeatherCurrent,
 *   hourly: WeatherHourly,
 *   daily: WeatherDaily,
 *   nowcast: WeatherNowcast
 * }} AppWeatherModel
 */

export const WEATHER_MODEL_SCHEMA_VERSION = 1;

/**
 * Creates a fresh app weather model skeleton.
 * @returns {AppWeatherModel}
 */
export function createEmptyWeatherModel() {
  return {
    meta: {
      latitude: null,
      longitude: null,
      timezone: "UTC",
    },
    current: {
      temperature: null,
      humidity: null,
      feelsLike: null,
      conditionCode: null,
      windSpeed: null,
      windGust: null,
      windDirection: null,
      pressure: null,
      dewPoint: null,
      cloudCover: null,
      visibility: null,
    },
    hourly: {
      time: [],
      temperature: [],
      conditionCode: [],
      rainChance: [],
      rainAmount: [],
      pressure: [],
      cape: [],
      windGust: [],
    },
    daily: {
      time: [],
      conditionCode: [],
      temperatureMax: [],
      temperatureMin: [],
      sunrise: [],
      sunset: [],
      uvIndexMax: [],
      rainChanceMax: [],
      rainAmountTotal: [],
    },
    nowcast: {
      time: [],
      conditionCode: [],
      rainChance: [],
      rainAmount: [],
    },
  };
}
