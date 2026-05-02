// Dev-only mock that patches `fetch` to return a payload with several
// missing readings, so `?mock=missing` reliably reproduces the trust
// contract for screenshots and ad-hoc QA. The mock is only installed
// in development builds (Vite's `import.meta.env.DEV` flag) and only
// when the user explicitly opts in via the URL query parameter.

const FORECAST_PREFIX = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_PREFIX = "https://air-quality-api.open-meteo.com/v1/air-quality";
const ARCHIVE_PREFIX = "https://archive-api.open-meteo.com/v1/archive";
const ALERTS_PREFIX = "https://api.weather.gov/alerts/active";

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function geoJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/geo+json" },
  });
}

function buildMissingForecastPayload(latitude, longitude) {
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  // 24-hour hourly window centred on now. Most slots have temperature
  // data; a handful are nulled out so the chart visibly "skips" past
  // the missing samples instead of drawing fake 0°F points.
  const hourly = Array.from({ length: 24 }, (_, index) => {
    const time = new Date(currentHour.getTime() + index * 60 * 60 * 1000);
    return {
      time: time.toISOString().slice(0, 16),
      temperature: index % 5 === 0 ? null : 65 + Math.round(Math.sin(index / 3) * 6),
      code: 2,
      rainChance: null,
      rainAmount: null,
    };
  });

  const dailyTimes = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  return {
    latitude,
    longitude,
    timezone: "America/Chicago",
    current: {
      // Keep the headline temperature so the dashboard still looks
      // like a working forecast — the screenshot shows that everything
      // else degrades gracefully when the API skips a field.
      temperature_2m: 67.4,
      relative_humidity_2m: null,
      apparent_temperature: null,
      weather_code: 2,
      wind_speed_10m: 9.8,
      wind_gusts_10m: null,
      wind_direction_10m: 220,
      surface_pressure: null,
      dew_point_2m: null,
      cloud_cover: 34,
      visibility: null,
    },
    hourly: {
      time: hourly.map((h) => h.time),
      temperature_2m: hourly.map((h) => h.temperature),
      weather_code: hourly.map((h) => h.code),
      precipitation_probability: hourly.map((h) => h.rainChance),
      precipitation: hourly.map((h) => h.rainAmount),
      surface_pressure: hourly.map(() => null),
      cape: hourly.map(() => null),
      wind_gusts_10m: hourly.map(() => null),
    },
    daily: {
      time: dailyTimes,
      weather_code: [2, 3, null, 3, 2, 2, 1],
      temperature_2m_max: [70, 72, null, 69, 66, 67, 71],
      temperature_2m_min: [55, 56, null, 57, 53, 54, 56],
      sunrise: dailyTimes.map((day) => `${day}T11:18:00-05:00`),
      sunset: dailyTimes.map((day) => `${day}T23:41:00-05:00`),
      uv_index_max: [null, 7, 6, 7, 6, 6, 7],
      precipitation_probability_max: [10, 20, null, 60, 30, 20, 10],
      precipitation_sum: [0, 0.04, null, 0.31, 0.12, 0.01, 0],
    },
    minutely_15: {
      time: [],
      weather_code: [],
      precipitation_probability: [],
      precipitation: [],
    },
  };
}

function buildMissingAirQualityPayload() {
  return { current: { european_aqi: null } };
}

function buildMissingArchivePayload() {
  return { daily: { time: [], temperature_2m_mean: [], temperature_2m_min: [], temperature_2m_max: [] } };
}

function shouldEnable() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("mock") === "missing";
  } catch {
    return false;
  }
}

/**
 * Installs a fetch override that returns missing-data payloads for the
 * Open-Meteo + NWS endpoints when `?mock=missing` is in the URL. Returns
 * true if the override was installed, false otherwise.
 */
export function installMissingDataMockIfRequested() {
  if (!shouldEnable()) return false;
  if (typeof globalThis.fetch !== "function") return false;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";

    if (url.startsWith(FORECAST_PREFIX)) {
      const requestUrl = new URL(url);
      const latitude = Number(requestUrl.searchParams.get("latitude")) || 41.8781;
      const longitude = Number(requestUrl.searchParams.get("longitude")) || -87.6298;
      return jsonResponse(buildMissingForecastPayload(latitude, longitude));
    }

    if (url.startsWith(AIR_QUALITY_PREFIX)) {
      return jsonResponse(buildMissingAirQualityPayload());
    }

    if (url.startsWith(ARCHIVE_PREFIX)) {
      return jsonResponse(buildMissingArchivePayload());
    }

    if (url.startsWith(ALERTS_PREFIX)) {
      // Empty feed so the alerts card shows the empty-state copy.
      return geoJsonResponse({ type: "FeatureCollection", features: [] });
    }

    return originalFetch(input, init);
  };

  return true;
}
