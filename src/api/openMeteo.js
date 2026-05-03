// src/api/openMeteo.js

import { validateCoordinates } from "../utils/weatherUnits.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { normalizeTimeZone, normalizeWeatherResponse } from "./transforms.js";

const ENDPOINTS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  archive: "https://archive-api.open-meteo.com/v1/archive",
  aqi: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  alerts: "https://api.weather.gov/alerts/active",
};
const GEOCODE_RESULTS_LIMIT = 5;

const TIMEOUT_MS = 10_000;
const DEFAULT_TEMPERATURE_UNIT = "fahrenheit";
const DEFAULT_WIND_SPEED_UNIT = "mph";
const DEFAULT_PRECIPITATION_UNIT = "inch";
const DEFAULT_TIMEZONE = "UTC";
export const ALERTS_STATUS = {
  ready: "ready",
  unsupported: "unsupported",
  unavailable: "unavailable",
};

function getSignal(signal) {
  const hasAbortSignal = typeof AbortSignal !== "undefined";
  const timeoutSignal =
    hasAbortSignal && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(TIMEOUT_MS)
      : undefined;

  if (!signal) {
    return timeoutSignal;
  }

  if (
    timeoutSignal &&
    hasAbortSignal &&
    typeof AbortSignal.any === "function"
  ) {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  return signal;
}

function getUtcDateParts(now) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return {
    year,
    month,
    day,
    monthDay: `${year}-${month}-${day}`,
  };
}

function getDatePartsInTimeZone(now, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const yearPart = parts.find((part) => part.type === "year")?.value;
  const monthPart = parts.find((part) => part.type === "month")?.value;
  const dayPart = parts.find((part) => part.type === "day")?.value;
  const year = Number(yearPart);

  if (!Number.isFinite(year)) {
    return null;
  }
  if (!/^\d{2}$/.test(monthPart ?? "") || !/^\d{2}$/.test(dayPart ?? "")) {
    return null;
  }

  return {
    year,
    month: monthPart,
    day: dayPart,
    monthDay: `${year}-${monthPart}-${dayPart}`,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: getSignal(options.signal),
  });

  if (!response.ok) {
    const error = new Error(`Request failed (${response.status})`);
    error.name = "RequestError";
    error.status = response.status;
    error.url = url;
    throw error;
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Invalid JSON response from weather service");
  }
}

function getDateInTimeZone(timeZone) {
  const now = new Date();
  const zone = normalizeTimeZone(timeZone);
  let year;
  let month;
  let day;
  let monthDay;
  let monthLabel;

  try {
    const parsed = getDatePartsInTimeZone(now, zone);
    if (!parsed) {
      throw new Error("Invalid timezone date format");
    }
    year = parsed.year;
    month = parsed.month;
    day = parsed.day;
    monthLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "long",
      day: "numeric",
    }).format(now);
  } catch {
    const fallbackLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: DEFAULT_TIMEZONE,
    }).format(now);
    const parsedFallback = getDatePartsInTimeZone(now, DEFAULT_TIMEZONE);
    if (parsedFallback) {
      year = parsedFallback.year;
      month = parsedFallback.month;
      day = parsedFallback.day;
      monthDay = parsedFallback.monthDay;
      monthLabel = fallbackLabel;
    } else {
      const utcParts = getUtcDateParts(now);
      year = utcParts.year;
      month = utcParts.month;
      day = utcParts.day;
      monthDay = utcParts.monthDay;
      monthLabel = fallbackLabel;
    }
  }

  return {
    year,
    month,
    day,
    monthDay,
    monthDayLabel: monthLabel,
  };
}

const toNumber = toFiniteNumber;

function mapAlertSeverityScore(severity) {
  const normalized = typeof severity === "string" ? severity.trim().toLowerCase() : "";
  if (normalized === "extreme") return 4;
  if (normalized === "severe") return 3;
  if (normalized === "moderate") return 2;
  if (normalized === "minor") return 1;
  return 0;
}

function mapAlertUrgencyScore(urgency) {
  const normalized = typeof urgency === "string" ? urgency.trim().toLowerCase() : "";
  if (normalized === "immediate") return 2;
  if (normalized === "expected") return 1;
  return 0;
}

function getAlertPriority(score) {
  if (score >= 6) return "critical";
  if (score >= 4) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

function normalizeAlert(feature, index) {
  const properties =
    feature && typeof feature === "object" && feature.properties && typeof feature.properties === "object"
      ? feature.properties
      : {};
  const severity = typeof properties.severity === "string" ? properties.severity : "Unknown";
  const urgency = typeof properties.urgency === "string" ? properties.urgency : "Unknown";
  const alertScore = mapAlertSeverityScore(severity) + mapAlertUrgencyScore(urgency);

  return {
    id: typeof properties.id === "string" ? properties.id : `alert-${index}`,
    event: typeof properties.event === "string" ? properties.event : "Weather Alert",
    headline: typeof properties.headline === "string" ? properties.headline : "",
    area: typeof properties.areaDesc === "string" ? properties.areaDesc : "",
    severity,
    urgency,
    certainty: typeof properties.certainty === "string" ? properties.certainty : "Unknown",
    startsAt: typeof properties.effective === "string" ? properties.effective : null,
    endsAt: typeof properties.expires === "string" ? properties.expires : null,
    sender: typeof properties.senderName === "string" ? properties.senderName : "National Weather Service",
    description: typeof properties.description === "string" ? properties.description : "",
    priority: getAlertPriority(alertScore),
    priorityScore: alertScore,
  };
}

/**
 * Fetches current weather, hourly forecast, and 7-day daily forecast
 * from Open-Meteo. No API key required.
 * @returns {Promise<import("./types.js").AppWeatherModel>}
 */
export async function fetchWeather(lat, lon, options = {}) {
  const coordinates = validateCoordinates(lat, lon);
  const {
    signal,
    temperatureUnit = DEFAULT_TEMPERATURE_UNIT,
    windSpeedUnit = DEFAULT_WIND_SPEED_UNIT,
    precipitationUnit = DEFAULT_PRECIPITATION_UNIT,
  } = options;
  const params = new URLSearchParams({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
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

  const rawResponse = await fetchJson(`${ENDPOINTS.weather}?${params}`, { signal });
  return normalizeWeatherResponse(rawResponse);
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
  const coordinates = validateCoordinates(lat, lon);
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
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    start_date: start,
    end_date: end,
    daily: "temperature_2m_mean,temperature_2m_min,temperature_2m_max",
    temperature_unit: temperatureUnit,
    timezone: normalizeTimeZone(timezone),
  });

  const data = await fetchJson(`${ENDPOINTS.archive}?${params}`, { signal });
  const daily = data?.daily;
  const times = daily?.time;
  if (!Array.isArray(times) || !times.length) {
    return null;
  }

  const meanSeries = Array.isArray(daily?.temperature_2m_mean)
    ? daily.temperature_2m_mean
    : [];
  const minSeries = Array.isArray(daily?.temperature_2m_min)
    ? daily.temperature_2m_min
    : [];
  const maxSeries = Array.isArray(daily?.temperature_2m_max)
    ? daily.temperature_2m_max
    : [];

  const targetSuffix = `-${month}-${day}`;
  let total = 0;
  let sampleCount = 0;

  for (let i = 0; i < times.length; i += 1) {
    if (!times[i]?.endsWith(targetSuffix)) continue;

    const mean = toNumber(meanSeries[i]);
    const min = toNumber(minSeries[i]);
    const max = toNumber(maxSeries[i]);

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
  const coordinates = validateCoordinates(lat, lon);
  try {
    const data = await fetchJson(
      `${ENDPOINTS.aqi}?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&current=european_aqi`,
      { signal: options.signal }
    );
    const aqi = Number(data?.current?.european_aqi);
    return Number.isFinite(aqi) ? aqi : null;
  } catch {
    return null;
  }
}

/**
 * Converts a city name into coordinates (used for search).
 */
export async function geocodeCity(name, options = {}) {
  const query = typeof name === "string" ? name.trim() : "";
  if (!query) {
    return [];
  }

  const data = await fetchJson(
    `${ENDPOINTS.geocode}?name=${encodeURIComponent(query)}&count=${GEOCODE_RESULTS_LIMIT}`,
    { signal: options.signal }
  );
  return Array.isArray(data?.results) ? data.results : [];
}

/**
 * Fetches active severe weather alerts from U.S. National Weather Service.
 * Returns coverage metadata so the UI can distinguish no alerts from no support.
 */
export async function fetchSevereWeatherAlerts(lat, lon, options = {}) {
  const coordinates = validateCoordinates(lat, lon);
  const params = new URLSearchParams({
    point: `${coordinates.latitude},${coordinates.longitude}`,
  });
  try {
    const payload = await fetchJson(`${ENDPOINTS.alerts}?${params}`, {
      signal: options.signal,
      headers: {
        Accept: "application/geo+json",
      },
    });

    const features = Array.isArray(payload?.features) ? payload.features : [];
    return {
      alerts: features
        .map((feature, index) => normalizeAlert(feature, index))
        .sort((a, b) => b.priorityScore - a.priorityScore),
      status: ALERTS_STATUS.ready,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    const status = Number(error?.status);
    return {
      alerts: [],
      status:
        status === 400 || status === 404
          ? ALERTS_STATUS.unsupported
          : ALERTS_STATUS.unavailable,
    };
  }
}

