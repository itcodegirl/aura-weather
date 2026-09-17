// src/api/types.js

/*
 * Units are fixed by the request `fetchWeather` makes and by the conversions
 * in `transforms.js`, never by whatever the provider happens to send:
 * temperatures °F, wind speeds mph, precipitation inches, pressure hPa,
 * visibility METRES. The provider declares visibility in feet alongside
 * inch precipitation; `normalizeVisibility` converts it at the boundary so
 * consumers convert for display only.
 *
 * Time: `current.time` is the instant the current conditions are valid
 * for, as the provider's naive location-local string ("2026-09-16T19:30"),
 * and `current.interval` the model grid in seconds (900). `meta.utcOffsetSeconds`
 * is the location's offset from UTC, so a naive string can be placed on the
 * real timeline without the device's zone.
 */

/**
 * @typedef {{latitude: number|null, longitude: number|null, timezone: string, utcOffsetSeconds: number|null}} WeatherMeta
 * @typedef {{
 *   time: string|null,
 *   interval: number|null,
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
 *   visibility: number|null,
 *   isDay: number|null
 * }} WeatherCurrent
 * @typedef {{
 *   time: string[],
 *   temperature: number[],
 *   conditionCode: number[],
 *   rainChance: number[],
 *   rainAmount: number[],
 *   pressure: number[],
 *   cape: number[],
 *   windSpeed: number[],
 *   windGust: number[],
 *   windDirection: number[],
 *   humidity: number[],
 *   dewPoint: number[],
 *   feelsLike: number[],
 *   uvIndex: number[],
 *   visibility: number[]
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
 *   rainAmountTotal: number[],
 *   windSpeedMax: number[],
 *   windGustMax: number[],
 *   windDirectionDominant: number[]
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
      utcOffsetSeconds: null,
    },
    current: {
      time: null,
      interval: null,
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
      isDay: null,
    },
    hourly: {
      time: [],
      temperature: [],
      conditionCode: [],
      rainChance: [],
      rainAmount: [],
      pressure: [],
      cape: [],
      windSpeed: [],
      windGust: [],
      windDirection: [],
      humidity: [],
      dewPoint: [],
      feelsLike: [],
      uvIndex: [],
      visibility: [],
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
      windSpeedMax: [],
      windGustMax: [],
      windDirectionDominant: [],
    },
    nowcast: {
      time: [],
      conditionCode: [],
      rainChance: [],
      rainAmount: [],
    },
  };
}
