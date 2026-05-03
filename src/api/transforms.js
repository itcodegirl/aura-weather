import { createEmptyWeatherModel } from "./types.js";
import { toFiniteNumber } from "../utils/numbers.js";

const DEFAULT_TIMEZONE = "UTC";

export function normalizeTimeZone(value, fallback = DEFAULT_TIMEZONE) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

const toNumber = toFiniteNumber;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Maps Open-Meteo payload into a stable app-domain weather model.
 * @param {any} raw
 * @returns {import("./types.js").AppWeatherModel}
 */
export function normalizeWeatherResponse(raw) {
  const model = createEmptyWeatherModel();
  const safe = raw && typeof raw === "object" ? raw : {};
  const current = safe.current && typeof safe.current === "object" ? safe.current : {};
  const hourly = safe.hourly && typeof safe.hourly === "object" ? safe.hourly : {};
  const daily = safe.daily && typeof safe.daily === "object" ? safe.daily : {};
  const minutely =
    safe.minutely_15 && typeof safe.minutely_15 === "object"
      ? safe.minutely_15
      : {};

  return {
    ...model,
    meta: {
      ...model.meta,
      latitude: toNumber(safe.latitude),
      longitude: toNumber(safe.longitude),
      timezone: normalizeTimeZone(safe.timezone),
    },
    current: {
      ...model.current,
      temperature: toNumber(current.temperature_2m),
      humidity: toNumber(current.relative_humidity_2m),
      feelsLike: toNumber(current.apparent_temperature),
      conditionCode: toNumber(current.weather_code),
      windSpeed: toNumber(current.wind_speed_10m),
      windGust: toNumber(current.wind_gusts_10m),
      windDirection: toNumber(current.wind_direction_10m),
      pressure: toNumber(current.surface_pressure),
      dewPoint: toNumber(current.dew_point_2m),
      cloudCover: toNumber(current.cloud_cover),
      visibility: toNumber(current.visibility),
    },
    hourly: {
      ...model.hourly,
      time: asArray(hourly.time),
      temperature: asArray(hourly.temperature_2m),
      conditionCode: asArray(hourly.weather_code),
      rainChance: asArray(hourly.precipitation_probability),
      rainAmount: asArray(hourly.precipitation),
      pressure: asArray(hourly.surface_pressure),
      cape: asArray(hourly.cape),
      windGust: asArray(hourly.wind_gusts_10m),
    },
    daily: {
      ...model.daily,
      time: asArray(daily.time),
      conditionCode: asArray(daily.weather_code),
      temperatureMax: asArray(daily.temperature_2m_max),
      temperatureMin: asArray(daily.temperature_2m_min),
      sunrise: asArray(daily.sunrise),
      sunset: asArray(daily.sunset),
      uvIndexMax: asArray(daily.uv_index_max),
      rainChanceMax: asArray(daily.precipitation_probability_max),
      rainAmountTotal: asArray(daily.precipitation_sum),
    },
    nowcast: {
      ...model.nowcast,
      time: asArray(minutely.time),
      conditionCode: asArray(minutely.weather_code),
      rainChance: asArray(minutely.precipitation_probability),
      rainAmount: asArray(minutely.precipitation),
    },
  };
}
