// src/api/openMeteo.js

import { validateCoordinates } from "../utils/weatherUnits.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { DISPLAY_LOCALE, PARTS_LOCALE } from "../utils/formatters.js";
import {
  createAbortError,
  createRequestSignal,
  createTimeoutError,
  isAbortError,
  isTimeoutError,
} from "./requestSignal.js";
import { normalizeTimeZone, normalizeWeatherResponse } from "./transforms.js";

/**
 * An HTTP failure this module raises. `status` drives the retry decision and
 * `url` names the endpoint in logs; neither is on the built-in `Error`.
 * @typedef {Error & {status?: number, url?: string}} RequestError
 */

const ENDPOINTS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  archive: "https://archive-api.open-meteo.com/v1/archive",
  aqi: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  alerts: "https://api.weather.gov/alerts/active",
};
const GEOCODE_RESULTS_LIMIT = 5;

const TIMEOUT_MS = 10_000;
// Wall-clock ceiling for a whole retry sequence, not per attempt. The
// per-attempt timeout used to be the only bound, so a forecast that stalled
// through both retries ran ~31s (3 x 10s + backoff) before the UI said it had
// "timed out" — copy that was true of an attempt and false of the wait. One
// full attempt plus a real retry window fits in 15s; past that the honest
// answer is that the request timed out, so that is when it is given.
const TOTAL_TIMEOUT_MS = 15_000;
const DEFAULT_TEMPERATURE_UNIT = "fahrenheit";
const DEFAULT_WIND_SPEED_UNIT = "mph";
const DEFAULT_PRECIPITATION_UNIT = "inch";
const DEFAULT_TIMEZONE = "UTC";
const FORECAST_RETRY_DELAYS_MS = [250, 700];
const GEOCODE_RETRY_DELAYS_MS = [200];
const SUPPLEMENTAL_RETRY_DELAYS_MS = [300];

/*
 * How much of the hourly series this app actually reads.
 *
 * `forecast_days=7` does NOT bound the hourly block once `past_hours` is set.
 * Measured against the live API for Palos Hills on 2026-09-17, the request
 * came back with 432 hourly slots spanning 2026-09-15T12:00 -> 2026-10-03T11:00
 * — 48 hours back plus SIXTEEN forecast days — in a 60,472-byte payload whose
 * hourly block alone was 34,287 bytes. `forecast_hours` is what bounds it.
 *
 * FORECAST_HOURS is not simply the 24 hours the UI renders, and 24 would be a
 * bug. A snapshot restored on a degraded path (offline cold start, failed
 * refresh) can be up to 48 hours old and is rendered in full, hourly card
 * included. Its forward horizon has to survive that replay:
 *
 *   FORECAST_HOURS = 24 (rendered window) + 48 (oldest snapshot ever replayed)
 *
 * Both halves live elsewhere — `WINDOW` in HourlyCard, DEGRADED_SNAPSHOT_MAX_AGE_MS
 * in useWeatherData — and the layer rules stop this module importing either.
 * `forecastWindow.test.mjs` reads all three from their real homes and fails if
 * they stop agreeing. That test is the mechanism; this comment is not.
 *
 * PAST_HOURS is unchanged. The deepest lookback is analyzeRain's running "so
 * far today" total, which walks back to the location's own midnight.
 */
const FORECAST_HOURS = 72;
const PAST_HOURS = 48;

/*
 * The same bound, for the 15-minute series behind the nowcast card.
 *
 * `forecast_days=7` DOES bound this block, and seven days of quarter-hours is
 * 672 slots: 18,192 bytes measured on 2026-09-17, which was 55% of the whole
 * response once the hourly block was trimmed. `forecast_minutely_15` counts
 * timesteps from the current quarter-hour, measured: 8 -> 8 slots
 * (14:00-15:45), 200 -> 200 slots (14:00 -> +50h).
 *
 * The obvious bound is NOWCAST_WINDOW_SIZE — the 8 slots analyzeNowcast reads,
 * exactly two hours. It is wrong, for a reason worth writing down because the
 * code does not show it: `findWindowStartIndex` does not report that "now" is
 * past the end of a series. Its last branch CLAMPS to the trailing window. So
 * an 8-slot series replayed from a 48-hour-old snapshot does not degrade to
 * the card's "No minute-by-minute points are available" — it renders the tail
 * of a two-day-old window as the next two hours. Measured:
 *
 *   series 2026-09-15T17:00 -> 19:15, read at 2026-09-17T17:00Z
 *   -> "Heavy rain likely now, lasting through most of the window"
 *
 * Bounding tight would manufacture that on every offline restore. So this
 * carries the replay the same way FORECAST_HOURS does:
 *
 *   FORECAST_MINUTELY_15_STEPS
 *     = NOWCAST_WINDOW_SIZE (8 slots, 2h)
 *     + DEGRADED_SNAPSHOT_MAX_AGE_MS as quarter-hours (48h -> 192 slots)
 *
 * `forecastWindow.test.mjs` derives all of that from the real files and fails
 * in both directions.
 */
const FORECAST_MINUTELY_15_STEPS = 200;

export const ALERTS_STATUS = {
  ready: "ready",
  unsupported: "unsupported",
  unavailable: "unavailable",
};

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function normalizeRetryDelays(delays) {
  if (!Array.isArray(delays)) {
    return SUPPLEMENTAL_RETRY_DELAYS_MS;
  }

  return delays
    .map((delay) => toFiniteNumber(delay))
    .filter((delay) => delay !== null && delay >= 0);
}

function isRetryableError(error) {
  if (isAbortError(error)) {
    return false;
  }

  const status = toFiniteNumber(error?.status);
  return status === null || status === 408 || status === 429 || status >= 500;
}

function waitForRetry(delayMs, signal) {
  throwIfAborted(signal);
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  // The annotation is what lets `resolve()` be called with no argument:
  // without it the checker infers `Promise<unknown>` and demands one.
  return /** @type {Promise<void>} */ (
    new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener?.("abort", handleAbort);
        resolve();
      }, delayMs);

      function handleAbort() {
        clearTimeout(timeoutId);
        reject(createAbortError());
      }

      signal?.addEventListener?.("abort", handleAbort, { once: true });
    })
  );
}

// The request-timing knobs travel together so every adapter in this module
// honors the same budget and tests can shrink it without waiting out the
// production one.
function requestTiming(options, defaultRetryDelaysMs) {
  return {
    retryDelaysMs: options.retryDelaysMs ?? defaultRetryDelaysMs,
    timeoutMs: options.timeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
  };
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
  // Reading numeric parts, not rendering them.
  const formatter = new Intl.DateTimeFormat(PARTS_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const yearPart = parts.find((part) => part.type === "year")?.value;
  const monthPart = parts.find((part) => part.type === "month")?.value;
  const dayPart = parts.find((part) => part.type === "day")?.value;
  const year = toFiniteNumber(yearPart);

  if (year === null) {
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
  const {
    retryDelaysMs: _retryDelaysMs,
    totalTimeoutMs: _totalTimeoutMs,
    timeoutMs,
    signal,
    ...fetchOptions
  } = options;
  // Cancellation and timeout are composed manually rather than through
  // AbortSignal.any, which Safari <17 and Firefox <115 lack. release() runs
  // in the finally so neither the timer nor the caller-signal listener
  // outlives the attempt.
  const attempt = createRequestSignal(signal, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: attempt.signal,
    });

    if (!response.ok) {
      // `status` and `url` are read by isRetryableError and by the UI's
      // failure copy. They are not on Error, so the shape is declared.
      const error = /** @type {RequestError} */ (
        new Error(`Request failed (${response.status})`)
      );
      error.name = "RequestError";
      error.status = response.status;
      error.url = String(url);
      throw error;
    }

    try {
      return await response.json();
    } catch {
      throw new Error("Invalid JSON response from weather service");
    }
  } catch (error) {
    throw attempt.normalizeError(error);
  } finally {
    attempt.release();
  }
}

async function fetchJsonWithRetry(url, options = {}) {
  const retryDelays = normalizeRetryDelays(options.retryDelaysMs);
  const attemptTimeoutMs = toFiniteNumber(options.timeoutMs) ?? TIMEOUT_MS;
  const totalTimeoutMs =
    toFiniteNumber(options.totalTimeoutMs) ?? TOTAL_TIMEOUT_MS;
  // One deadline for the whole sequence. Each attempt still gets its own
  // timeout, clamped to whatever is left, so retries can never push the total
  // wait past the budget the "timed out" copy promises.
  const deadlineAt = Date.now() + totalTimeoutMs;
  let lastError = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw isTimeoutError(lastError)
        ? lastError
        : createTimeoutError(
            `Request timed out after ${Math.round(totalTimeoutMs)}ms`,
            lastError ?? undefined
          );
    }

    try {
      return await fetchJson(url, {
        ...options,
        timeoutMs: Math.min(attemptTimeoutMs, remainingMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= retryDelays.length || !isRetryableError(error)) {
        throw error;
      }

      const delayMs = retryDelays[attempt];
      if (deadlineAt - Date.now() <= delayMs) {
        throw isTimeoutError(error)
          ? error
          : createTimeoutError(
              `Request timed out after ${Math.round(totalTimeoutMs)}ms`,
              error
            );
      }
      await waitForRetry(delayMs, options.signal);
    }
  }

  throw lastError;
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
    monthLabel = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone: zone,
      month: "long",
      day: "numeric",
    }).format(now);
  } catch {
    const fallbackLabel = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
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

function getAlertPriority(score, severityScore) {
  if (score >= 6) return "critical";
  if (score >= 4 || severityScore >= 3) return "high";
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
  const severityScore = mapAlertSeverityScore(severity);
  const alertScore = severityScore + mapAlertUrgencyScore(urgency);

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
    priority: getAlertPriority(alertScore, severityScore),
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
  // `pressure_msl`, not `surface_pressure`. Station pressure falls with
  // elevation, so at the default city (183 m) it reads ~21 hPa / 0.6 inHg
  // below the sea-level figure every weather report, phone app and home
  // barometer quotes — and the gauge sat near empty for any high city.
  // Sea-level pressure is the like-for-like number; the 6-hour trend is
  // unaffected either way because elevation does not change between samples.
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,dew_point_2m,cloud_cover,visibility,is_day",
    hourly:
      "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,pressure_msl,cape,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    minutely_15:
      "weather_code,precipitation_probability,precipitation",
    temperature_unit: temperatureUnit,
    wind_speed_unit: windSpeedUnit,
    precipitation_unit: precipitationUnit,
    timezone: "auto",
    forecast_days: "7",
    past_hours: String(PAST_HOURS),
    forecast_hours: String(FORECAST_HOURS),
    forecast_minutely_15: String(FORECAST_MINUTELY_15_STEPS),
  });

  const rawResponse = await fetchJsonWithRetry(`${ENDPOINTS.weather}?${params}`, {
    signal,
    ...requestTiming(options, FORECAST_RETRY_DELAYS_MS),
  });
  return normalizeWeatherResponse(rawResponse);
}

/**
 * Fetches the 30-year average of the daily maximum temperature for
 * today's calendar day, from the Open-Meteo historical archive.
 *
 * The daily maximum is the figure today's forecast high is compared
 * with (see buildClimateComparison), so it is the only field requested.
 * This used to pull the daily mean, minimum and maximum for the whole
 * 30-year span to keep 30 samples of the mean, which it then compared
 * with the instantaneous current temperature.
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
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    start_date: start,
    end_date: end,
    daily: "temperature_2m_max",
    temperature_unit: temperatureUnit,
    timezone: normalizeTimeZone(timezone),
  });

  const data = await fetchJsonWithRetry(`${ENDPOINTS.archive}?${params}`, {
    signal,
    ...requestTiming(options),
  });
  const daily = data?.daily;
  const times = daily?.time;
  if (!Array.isArray(times) || !times.length) {
    return null;
  }

  const maxSeries = Array.isArray(daily?.temperature_2m_max)
    ? daily.temperature_2m_max
    : [];

  const targetSuffix = `-${month}-${day}`;
  let total = 0;
  let sampleCount = 0;

  for (let i = 0; i < times.length; i += 1) {
    if (!times[i]?.endsWith(targetSuffix)) continue;

    // Strict coercion: a null or empty sample drops out of the average
    // rather than pulling it toward 0°F.
    const max = toNumber(maxSeries[i]);
    if (!Number.isFinite(max)) continue;

    total += max;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return null;
  }

  const averageHighTemperature = Number((total / sampleCount).toFixed(1));

  return {
    averageHighTemperature,
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
    // `us_aqi`, not `european_aqi`. They are different indices on different
    // scales: the European AQI runs roughly 0-100+ (0-20 good, 60-80 poor),
    // while the US EPA index runs 0-500 with its own breakpoints. This app
    // classifies and colours air quality with the EPA's six tiers
    // (domain/exposure.js) and draws the gauge as a fraction of 500, so it has
    // to be fed the EPA index. Reading the European value against EPA
    // thresholds understated the risk on the one health-relevant reading in the
    // app: a European 65 ("Poor") rendered as "Moderate", 13% along a gauge it
    // should have filled two-thirds of.
    const data = await fetchJsonWithRetry(
      `${ENDPOINTS.aqi}?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&current=us_aqi`,
      { signal: options.signal, ...requestTiming(options) }
    );
    // toFiniteNumber returns null for nullish/empty inputs; the legacy
    // Number()-based check would have surfaced a null AQI as 0.
    return toFiniteNumber(data?.current?.us_aqi);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
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

  const data = await fetchJsonWithRetry(
    `${ENDPOINTS.geocode}?name=${encodeURIComponent(query)}&count=${GEOCODE_RESULTS_LIMIT}`,
    {
      signal: options.signal,
      ...requestTiming(options, GEOCODE_RETRY_DELAYS_MS),
    }
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
    const payload = await fetchJsonWithRetry(`${ENDPOINTS.alerts}?${params}`, {
      signal: options.signal,
      ...requestTiming(options),
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

    const status = toFiniteNumber(error?.status);
    return {
      alerts: [],
      status:
        status === 400 || status === 404
          ? ALERTS_STATUS.unsupported
          : ALERTS_STATUS.unavailable,
    };
  }
}

