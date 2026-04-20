// src/hooks/useWeather.js

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchWeather,
  fetchAirQuality,
  fetchHistoricalTemperatureAverage,
} from "../services/weatherApi";

const DEFAULT_LOCATION = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Chicago",
  country: "United States",
};
const LOCATION_FALLBACK_NOTICE =
  "Location not available \u2014 showing Chicago";
const LAST_LOCATION_KEY = "aura-weather-last-location";
const SAVED_LOCATION_NOTICE = "Showing your previously selected location";

function getPersistedLocation() {
  try {
    const saved = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const lat = Number(parsed?.lat);
    const lon = Number(parsed?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
      lat,
      lon,
      name: typeof parsed?.name === "string" ? parsed.name : "",
      country: typeof parsed?.country === "string" ? parsed.country : "",
    };
  } catch {
    return null;
  }
}

function persistLocation(lat, lon, name, country) {
  try {
    window.localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat,
        lon,
        name: name || "",
        country: country || "",
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

function getFallbackLocationName(weatherData, lat, lon) {
  const timezoneCity = weatherData?.timezone
    ?.split("/")
    .at(-1)
    ?.replace(/_/g, " ");
  return (
    timezoneCity ||
    `${Number(lat).toFixed(2)}\u00b0, ${Number(lon).toFixed(2)}\u00b0`
  );
}

export function useWeather(unit = "F", options = {}) {
  const { climateEnabled = true } = options;

  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const [locationNotice, setLocationNotice] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);
  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const lastRequestedSignatureRef = useRef("");

  const abortInFlightRequest = useCallback(() => {
    if (!inFlightRequestRef.current) return;
    inFlightRequestRef.current.abort();
    inFlightRequestRef.current = null;
  }, []);

  const loadWeather = useCallback(
    async (lat, lon, name, country, requestUnit = unit, options = {}) => {
      const { fallbackNotice } = options;
      const requestId = requestIdRef.current + 1;
      const signature = `${lat},${lon},${requestUnit},${climateEnabled ? 1 : 0}`;

      requestIdRef.current = requestId;
      abortInFlightRequest();
      const controller = new AbortController();
      inFlightRequestRef.current = controller;
      lastRequestedSignatureRef.current = signature;

      setLoading(true);
      setError(null);
      setLocationNotice(fallbackNotice || null);
      setLastRequest({ lat, lon, name, country, unit: requestUnit });
      setClimateComparison(null);

      try {
        const [weatherData, aqi] = await Promise.all([
          fetchWeather(lat, lon, requestUnit, { signal: controller.signal }),
          fetchAirQuality(lat, lon, { signal: controller.signal }),
        ]);

        const historicalAverage = climateEnabled
          ? await fetchHistoricalTemperatureAverage(
              lat,
              lon,
              weatherData?.timezone,
              { signal: controller.signal }
            )
          : null;

        if (requestId !== requestIdRef.current) {
          return;
        }

        const resolvedName =
          name || getFallbackLocationName(weatherData, lat, lon);
        const currentTemperature = Number(weatherData?.current?.temperature_2m);
        const climateDelta =
          Number.isFinite(currentTemperature) &&
          historicalAverage &&
          Number.isFinite(historicalAverage.averageTemperatureF)
            ? currentTemperature - historicalAverage.averageTemperatureF
            : null;

        setWeather({ ...weatherData, aqi });
        setLocation({
          lat,
          lon,
          name: resolvedName,
          country: country || "",
        });
        persistLocation(lat, lon, resolvedName, country || "");
        setClimateComparison(
          historicalAverage && Number.isFinite(climateDelta)
            ? { ...historicalAverage, differenceF: climateDelta }
            : null
        );
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        if (error?.name === "AbortError") return;
        setError(error.message || "Could not load weather");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          if (inFlightRequestRef.current === controller) {
            inFlightRequestRef.current = null;
          }
        }
      }
    },
    [unit, climateEnabled, abortInFlightRequest]
  );

  const loadCurrentLocation = useCallback(
    (options = {}) => {
      const requestUnit = options.unit || unit;
      const fallbackNotice = options.fallbackNotice || LOCATION_FALLBACK_NOTICE;

      if (!navigator.geolocation) {
        setIsLocatingCurrent(false);
        loadWeather(
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country,
          requestUnit,
          { fallbackNotice }
        );
        return;
      }

      setIsLocatingCurrent(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          loadWeather(
            latitude,
            longitude,
            undefined,
            undefined,
            requestUnit
          );
          setIsLocatingCurrent(false);
        },
        () => {
          setIsLocatingCurrent(false);
          loadWeather(
            DEFAULT_LOCATION.lat,
            DEFAULT_LOCATION.lon,
            DEFAULT_LOCATION.name,
            DEFAULT_LOCATION.country,
            requestUnit,
            { fallbackNotice }
          );
        },
        { timeout: 5000 }
      );
    },
    [scheduleWeatherLoad, unit]
  );

  const retryWeather = useCallback(() => {
    const fallbackRequest = lastRequest || DEFAULT_LOCATION;

    loadWeather(
      fallbackRequest.lat,
      fallbackRequest.lon,
      fallbackRequest.name,
      fallbackRequest.country,
      fallbackRequest.unit || unit
    );
  }, [lastRequest, loadWeather, unit]);

  useEffect(() => {
    const persisted = getPersistedLocation();
    if (persisted) {
      loadWeather(
        persisted.lat,
        persisted.lon,
        persisted.name || DEFAULT_LOCATION.name,
        persisted.country || DEFAULT_LOCATION.country,
        unit,
        { fallbackNotice: SAVED_LOCATION_NOTICE }
      );
      return;
    }

    const fallbackTimer = setTimeout(() => {
      scheduleWeatherLoad(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name,
        DEFAULT_LOCATION.country,
        unit,
        { fallbackNotice: LOCATION_FALLBACK_NOTICE }
      );
    }, 6000);

    if (!navigator.geolocation) {
      clearTimeout(fallbackTimer);
      loadWeather(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name,
        DEFAULT_LOCATION.country,
        unit,
        { fallbackNotice: LOCATION_FALLBACK_NOTICE }
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallbackTimer);
        const { latitude, longitude } = pos.coords;
        loadWeather(latitude, longitude, undefined, undefined, unit);
      },
      () => {
        clearTimeout(fallbackTimer);
        loadWeather(
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country,
          unit,
          { fallbackNotice: LOCATION_FALLBACK_NOTICE }
        );
      },
      { timeout: 5000 }
    );

    return () => clearTimeout(fallbackTimer);
  }, [unit, loadWeather]);

  const hasLocation = location !== null;
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const locationName = location?.name;
  const locationCountry = location?.country;

  useEffect(() => {
    if (!hasLocation) return;

    const nextSignature = `${locationLat},${locationLon},${unit},${climateEnabled ? 1 : 0}`;
    if (nextSignature === lastRequestedSignatureRef.current) {
      return;
    }

    loadWeather(
      locationLat,
      locationLon,
      locationName,
      locationCountry,
      unit
    );
  }, [unit, climateEnabled, hasLocation, locationLat, locationLon, locationName, locationCountry, loadWeather]);

  useEffect(() => {
    return () => {
      abortInFlightRequest();
    };
  }, [abortInFlightRequest]);

  return {
    weather,
    location,
    loading,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
    retryWeather,
    climateComparison,
    isLocatingCurrent,
  };
}
