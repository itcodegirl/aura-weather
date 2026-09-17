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

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

/*
 * Open-Meteo declares the unit of every series it returns (`current_units`,
 * `hourly_units`), and the app cannot assume one. Visibility is documented in
 * metres, but the provider switches it to FEET whenever the request asks for
 * `precipitation_unit=inch` — which this app always does. Nothing read the
 * declared unit, so the Atmosphere tile divided a 48,885 ft reading by 1,609
 * as though it were metres and printed "30 mi · clear" on a nine-mile day;
 * fog at one mile rendered as three. The model therefore carries visibility
 * in METRES, converted here from whatever unit the provider declared.
 *
 * A payload with no declared unit (fixtures, older mocks) is taken as the
 * documented default, metres. A declared unit this table does not know is
 * treated as missing data: an unreadable unit must render "—", never a
 * number in the wrong unit.
 */
const VISIBILITY_METRES_PER_UNIT = {
  m: 1,
  ft: 0.3048,
};

export function normalizeVisibility(value, unit) {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  if (unit === undefined || unit === null) {
    return numeric;
  }
  const factor =
    typeof unit === "string"
      ? VISIBILITY_METRES_PER_UNIT[unit.trim().toLowerCase()]
      : undefined;
  return factor === undefined ? null : numeric * factor;
}

/**
 * Maps Open-Meteo payload into a stable app-domain weather model.
 * @param {any} raw
 * @returns {import("./types.js").AppWeatherModel}
 */
export function normalizeWeatherResponse(raw) {
  const model = createEmptyWeatherModel();
  const safe = asObject(raw);
  const current = asObject(safe.current);
  const currentUnits = asObject(safe.current_units);
  const hourly = asObject(safe.hourly);
  const hourlyUnits = asObject(safe.hourly_units);
  const daily = asObject(safe.daily);
  const minutely = asObject(safe.minutely_15);

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
      // Mean-sea-level pressure (hPa), the figure other weather sources
      // quote. The request used to ask for station pressure, which sits
      // ~21 hPa lower at the default city's 183 m and made the gauge read
      // wrong against every barometer. Deliberately no fallback to
      // `surface_pressure`: a station reading on a sea-level gauge is the
      // bug this replaces, so a payload without `pressure_msl` is missing.
      pressure: toNumber(current.pressure_msl),
      dewPoint: toNumber(current.dew_point_2m),
      cloudCover: toNumber(current.cloud_cover),
      visibility: normalizeVisibility(
        current.visibility,
        currentUnits.visibility
      ),
      isDay: toNumber(current.is_day),
    },
    hourly: {
      ...model.hourly,
      time: asArray(hourly.time),
      temperature: asArray(hourly.temperature_2m),
      conditionCode: asArray(hourly.weather_code),
      rainChance: asArray(hourly.precipitation_probability),
      rainAmount: asArray(hourly.precipitation),
      pressure: asArray(hourly.pressure_msl),
      cape: asArray(hourly.cape),
      windSpeed: asArray(hourly.wind_speed_10m),
      windGust: asArray(hourly.wind_gusts_10m),
      windDirection: asArray(hourly.wind_direction_10m),
      humidity: asArray(hourly.relative_humidity_2m),
      dewPoint: asArray(hourly.dew_point_2m),
      feelsLike: asArray(hourly.apparent_temperature),
      uvIndex: asArray(hourly.uv_index),
      visibility: asArray(hourly.visibility).map((value) =>
        normalizeVisibility(value, hourlyUnits.visibility)
      ),
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
      windSpeedMax: asArray(daily.wind_speed_10m_max),
      windGustMax: asArray(daily.wind_gusts_10m_max),
      windDirectionDominant: asArray(daily.wind_direction_10m_dominant),
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
