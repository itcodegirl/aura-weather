// src/hooks/useWeather.js

import { useState, useEffect, useCallback } from "react";
import { fetchWeather, fetchAirQuality } from "../services/weatherApi";

// Chicago fallback — Aura's default when geolocation isn't available
const DEFAULT_LOCATION = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Chicago",
  country: "United States",
};

function getFallbackLocationName(weatherData, lat, lon) {
  const timezoneCity = weatherData?.timezone?.split("/").at(-1)?.replace(/_/g, " ");
  return timezoneCity || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

export function useWeather() {
  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);

  // Core fetch function — reusable for any lat/lon
  const loadWeather = useCallback(
    async (lat, lon, name, country) => {
      setLoading(true);
      setError(null);
      setLastRequest({ lat, lon, name, country });

      try {
        const [weatherData, aqi] = await Promise.all([
          fetchWeather(lat, lon),
          fetchAirQuality(lat, lon),
        ]);

        const resolvedName = name || getFallbackLocationName(weatherData, lat, lon);

        setWeather({ ...weatherData, aqi });
        setLocation({ lat, lon, name: resolvedName, country: country || "" });
      } catch (err) {
        setError(err.message || "Could not load weather");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const retryWeather = useCallback(() => {
    const fallbackRequest = lastRequest
      ? lastRequest
      : DEFAULT_LOCATION;

    loadWeather(
      fallbackRequest.lat,
      fallbackRequest.lon,
      fallbackRequest.name,
      fallbackRequest.country
    );
  }, [lastRequest, loadWeather]);

  // On mount: try geolocation, fall back to Chicago
  useEffect(() => {
    // Hard safety net — if geolocation hangs silently, fall back after 6s
    const fallbackTimer = setTimeout(() => {
      loadWeather(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name,
        DEFAULT_LOCATION.country
      );
    }, 6000);

    if (!navigator.geolocation) {
      clearTimeout(fallbackTimer);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic mount-time data fetch; no user event to respond to
      loadWeather(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name,
        DEFAULT_LOCATION.country
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallbackTimer);
        const { latitude, longitude } = pos.coords;
        loadWeather(latitude, longitude);
      },
      () => {
        clearTimeout(fallbackTimer);
        // User denied geolocation — use fallback
        loadWeather(
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country
        );
      },
      { timeout: 5000 }
    );

    return () => clearTimeout(fallbackTimer);
  }, [loadWeather]);

  return { weather, location, loading, error, loadWeather, retryWeather };
}
