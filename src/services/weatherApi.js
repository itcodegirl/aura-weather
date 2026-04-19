// src/services/weatherApi.js

const ENDPOINTS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  aqi: "https://air-quality-api.open-meteo.com/v1/air-quality",
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
};

const TIMEOUT_MS = 10_000;

/**
 * Fetches current weather, hourly forecast, and 7-day daily forecast
 * from Open-Meteo. No API key required.
 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,dew_point_2m,cloud_cover,visibility",
    hourly:
      "temperature_2m,weather_code,precipitation_probability,precipitation,surface_pressure,cape,wind_gusts_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "7",
    past_hours: "6",
  });

  const res = await fetch(`${ENDPOINTS.weather}?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Weather data unavailable (${res.status})`);
  }
  return res.json();
}

/**
 * Fetches air quality data (European AQI scale).
 * Non-critical — returns null on failure instead of throwing.
 */
export async function fetchAirQuality(lat, lon) {
  try {
    const res = await fetch(
      `${ENDPOINTS.aqi}?latitude=${lat}&longitude=${lon}&current=european_aqi`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.current?.european_aqi ?? null;
  } catch {
    return null;
  }
}

/**
 * Converts a city name into coordinates (used for search).
 */
export async function geocodeCity(name) {
  const res = await fetch(
    `${ENDPOINTS.geocode}?name=${encodeURIComponent(name)}&count=5`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const data = await res.json();
  return data.results || [];
}

