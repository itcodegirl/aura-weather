// src/services/weatherApi.js
// Backward-compatible facade while API modules migrate to src/api/.

export {
  fetchWeather,
  fetchHistoricalTemperatureAverage,
  fetchAirQuality,
  geocodeCity,
} from "../api/index.js";

export { normalizeTimeZone, normalizeWeatherResponse } from "../api/index.js";
