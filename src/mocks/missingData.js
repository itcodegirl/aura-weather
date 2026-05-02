import { createEmptyWeatherModel } from "../api/types.js";

export const MISSING_MOCK_LOCATION = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Sample City",
  country: "Demo",
};

export const MISSING_MOCK_QUERY_KEY = "mock";
export const MISSING_MOCK_QUERY_VALUE = "missing";

const HOUR_MS = 60 * 60 * 1000;

function nullArray(length) {
  return Array.from({ length }, () => null);
}

function buildHourlyTimeline(length) {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  return Array.from({ length }, (_, idx) =>
    new Date(start.getTime() + idx * HOUR_MS).toISOString()
  );
}

function buildDailyTimeline(length) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length }, (_, idx) =>
    new Date(start.getTime() + idx * 24 * HOUR_MS)
      .toISOString()
      .slice(0, 10)
  );
}

export function buildMissingWeatherModel() {
  const model = createEmptyWeatherModel();
  const hourlyLength = 24;
  const dailyLength = 7;

  model.meta = {
    latitude: MISSING_MOCK_LOCATION.lat,
    longitude: MISSING_MOCK_LOCATION.lon,
    timezone: "UTC",
  };

  model.hourly = {
    time: buildHourlyTimeline(hourlyLength),
    temperature: nullArray(hourlyLength),
    conditionCode: nullArray(hourlyLength),
    rainChance: nullArray(hourlyLength),
    rainAmount: nullArray(hourlyLength),
    pressure: nullArray(hourlyLength),
    cape: nullArray(hourlyLength),
    windGust: nullArray(hourlyLength),
  };

  model.daily = {
    time: buildDailyTimeline(dailyLength),
    conditionCode: nullArray(dailyLength),
    temperatureMax: nullArray(dailyLength),
    temperatureMin: nullArray(dailyLength),
    sunrise: nullArray(dailyLength),
    sunset: nullArray(dailyLength),
    uvIndexMax: nullArray(dailyLength),
    rainChanceMax: nullArray(dailyLength),
    rainAmountTotal: nullArray(dailyLength),
  };

  model.nowcast = {
    time: buildHourlyTimeline(8),
    conditionCode: nullArray(8),
    rainChance: nullArray(8),
    rainAmount: nullArray(8),
  };

  return {
    ...model,
    aqi: null,
    alerts: [],
    alertsStatus: "ready",
  };
}

export function isMissingMockEnabled(search = "") {
  if (typeof search !== "string" || !search) {
    return false;
  }
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.get(MISSING_MOCK_QUERY_KEY) === MISSING_MOCK_QUERY_VALUE;
  } catch {
    return false;
  }
}

export function buildMissingDashboardState({ now = Date.now() } = {}) {
  return {
    weather: buildMissingWeatherModel(),
    location: { ...MISSING_MOCK_LOCATION },
    locationNotice: "Showing the mock 'missing data' demo state.",
    error: null,
    loading: false,
    isBackgroundLoading: false,
    isLocatingCurrent: false,
    isGeolocationSupported: false,
    hasPersistedLocation: false,
    showGlobalLoading: false,
    showGlobalError: false,
    showRefreshError: false,
    weatherDataUnit: "F",
    climateComparison: null,
    background: null,
    weatherInfo: null,
    trustMeta: {
      weatherFetchedAt: now,
      aqiFetchedAt: now,
      climateFetchedAt: null,
      climateStatus: "unavailable",
      alertsFetchedAt: now,
      alertsStatus: "ready",
    },
  };
}
