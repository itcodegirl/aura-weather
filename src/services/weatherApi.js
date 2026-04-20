// src/services/weatherApi.js

const ENDPOINTS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  archive: "https://archive-api.open-meteo.com/v1/archive",
  aqi: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
};
const GEOCODE_RESULTS_LIMIT = 5;

const TIMEOUT_MS = 10_000;
const DEFAULT_TEMPERATURE_UNIT = "fahrenheit";
const DEFAULT_WIND_SPEED_UNIT = "mph";
const DEFAULT_PRECIPITATION_UNIT = "inch";

function getSignal(signal) {
  if (signal) return signal;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
  return undefined;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: getSignal(options.signal),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

function getDateInTimeZone(timeZone) {
  const now = new Date();
  const zone = timeZone || "UTC";
  let year;
  let month;
  let day;
  let monthDay;
  let monthLabel;

  try {
    const formatDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    monthDay = formatDate.format(now);
    const parts = monthDay.split("-");

    year = Number(parts[0]);
    month = parts[1];
    day = parts[2];
    monthLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "long",
      day: "numeric",
    }).format(now);
  } catch {
    const fallback = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(now);
    const fallbackLabel = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(now);
    const fallbackParts = fallback.split("-");

    year = Number(fallbackParts[0]);
    month = fallbackParts[1];
    day = fallbackParts[2];
    monthLabel = fallbackLabel.replace(/,?\s\d{4}$/, "");
    monthDay = fallback;
  }

  return {
    year: Number(year),
    month,
    day,
    monthDay,
    monthDayLabel: monthLabel,
  };
}

function toF(value) {
  if (!Number.isFinite(value)) return null;
  return Number(value);
}

/**
 * Fetches current weather, hourly forecast, and 7-day daily forecast
 * from Open-Meteo. No API key required.
 */
export async function fetchWeather(lat, lon, options = {}) {
  const {
    signal,
    temperatureUnit = DEFAULT_TEMPERATURE_UNIT,
    windSpeedUnit = DEFAULT_WIND_SPEED_UNIT,
    precipitationUnit = DEFAULT_PRECIPITATION_UNIT,
  } = options;
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,dew_point_2m,cloud_cover,visibility",
    hourly:
      "temperature_2m,weather_code,precipitation_probability,precipitation,surface_pressure,cape,wind_gusts_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum",
    minutely_15:
      "weather_code,precipitation_probability,precipitation",
    temperature_unit: temperatureUnit,
    wind_speed_unit: windSpeedUnit,
    precipitation_unit: precipitationUnit,
    timezone: "auto",
    forecast_days: "7",
    past_hours: "48",
  });

  return fetchJson(`${ENDPOINTS.weather}?${params}`, { signal });
}

/**
 * Fetches today's temperature average for the same calendar day over
 * the last 30 years using Open-Meteo historical archive API.
 */
export async function fetchHistoricalTemperatureAverage(
  lat,
  lon,
  timezone,
  options = {}
) {
  const { signal, temperatureUnit = DEFAULT_TEMPERATURE_UNIT } = options;
  const { year, month, day, monthDayLabel } = getDateInTimeZone(timezone);
  const startYear = year - 30;
  const endYear = year - 1;

  if (startYear >= endYear) {
    return null;
  }

  const start = `${startYear}-${month}-${day}`;
  const end = `${endYear}-${month}-${day}`;

  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    start_date: start,
    end_date: end,
    daily: "temperature_2m_mean,temperature_2m_min,temperature_2m_max",
    temperature_unit: temperatureUnit,
    timezone: timezone || "UTC",
  });

  const data = await fetchJson(`${ENDPOINTS.archive}?${params}`, { signal });
  const times = data?.daily?.time;
  if (!Array.isArray(times) || !times.length) {
    return null;
  }

  const targetSuffix = `-${month}-${day}`;
  let total = 0;
  let sampleCount = 0;

  for (let i = 0; i < times.length; i += 1) {
    if (!times[i]?.endsWith(targetSuffix)) continue;

    const mean = toF(Number(data.daily.temperature_2m_mean?.[i]));
    const min = toF(Number(data.daily.temperature_2m_min?.[i]));
    const max = toF(Number(data.daily.temperature_2m_max?.[i]));

    let sample = mean;
    if (!Number.isFinite(sample) && Number.isFinite(min) && Number.isFinite(max)) {
      sample = (min + max) / 2;
    }
    if (!Number.isFinite(sample)) continue;

    total += sample;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return null;
  }

  const averageTemperature = Number((total / sampleCount).toFixed(1));

  return {
    averageTemperature,
    averageTemperatureF: averageTemperature,
    averageTemperatureUnit: temperatureUnit,
    sampleYears: sampleCount,
    referenceDateLabel: monthDayLabel,
    timeRange: `${startYear}-${endYear}`,
  };
}

/**
 * Fetches air quality data (European AQI scale).
 * Non-critical: returns null on failure instead of throwing.
 */
export async function fetchAirQuality(lat, lon, options = {}) {
  try {
    const data = await fetchJson(
      `${ENDPOINTS.aqi}?latitude=${lat}&longitude=${lon}&current=european_aqi`,
      { signal: options.signal }
    );
    return data.current?.european_aqi ?? null;
  } catch {
    return null;
  }
}

/**
 * Converts a city name into coordinates (used for search).
 */
export async function geocodeCity(name, options = {}) {
  const data = await fetchJson(
    `${ENDPOINTS.geocode}?name=${encodeURIComponent(name)}&count=${GEOCODE_RESULTS_LIMIT}`,
    { signal: options.signal }
  );
  return data.results || [];
}

