// src/hooks/useWeather.js

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchWeather,
  fetchAirQuality,
  fetchHistoricalTemperatureAverage,
} from "../services/weatherApi";
import {
  getApiTemperatureUnit,
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  normalizeTemperatureUnit,
  parseCoordinates,
} from "../utils/weatherUnits";

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
const GEOLOCATION_TIMEOUT_MS = 5000;
const LOCATION_FALLBACK_DELAY_MS = GEOLOCATION_TIMEOUT_MS + 1000;
const DEFAULT_DATA_UNIT = "F";
const LAST_LOCATION_TTL_DAYS = 30;

function normalizeLocationName(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function hasValidLastLocationTimestamp(saved) {
  if (!saved?.updatedAt) {
    return false;
  }
  const savedTime = Date.parse(saved.updatedAt);
  if (!Number.isFinite(savedTime)) {
    return false;
  }

  const ageMs = Date.now() - savedTime;
  const maxAgeMs = LAST_LOCATION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

function hasGeolocationSupport() {
  return (
    typeof navigator !== "undefined" &&
    navigator &&
    typeof navigator.geolocation !== "undefined" &&
    navigator.geolocation !== null &&
    typeof navigator.geolocation.getCurrentPosition === "function"
  );
}

function getPersistedLocation() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const saved = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!hasValidLastLocationTimestamp(parsed)) {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
      return null;
    }

    const coordinates = parseCoordinates(parsed?.lat, parsed?.lon);
    if (!coordinates) {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
      return null;
    }

    return {
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      name: normalizeLocationName(parsed?.name, DEFAULT_LOCATION.name),
      country: normalizeLocationName(parsed?.country, DEFAULT_LOCATION.country),
    };
  } catch {
    try {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
    } catch {
      // localStorage may be unavailable or inaccessible in restricted contexts.
    }
    return null;
  }
}

function persistLocation(lat, lon, name, country) {
  const coordinates = parseCoordinates(lat, lon);
  if (!coordinates) return;
  const normalizedName = normalizeLocationName(name, DEFAULT_LOCATION.name);
  const normalizedCountry = normalizeLocationName(
    country,
    DEFAULT_LOCATION.country
  );

  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: coordinates.latitude,
        lon: coordinates.longitude,
        name: normalizedName,
        country: normalizedCountry,
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
  const [weatherDataUnit, setWeatherDataUnit] = useState(DEFAULT_DATA_UNIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const [locationNotice, setLocationNotice] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);
  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const lastRequestedSignatureRef = useRef("");
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const abortInFlightRequest = useCallback(() => {
    if (!inFlightRequestRef.current) return;
    inFlightRequestRef.current.abort();
    inFlightRequestRef.current = null;
  }, []);

  const loadWeather = useCallback(
    async (lat, lon, name, country, requestUnit = unit, loadOptions = {}) => {
      if (!isMountedRef.current) return;

      const coordinates = parseCoordinates(lat, lon);
      const { fallbackNotice } = loadOptions;
      if (!coordinates) {
        setError("Invalid location coordinates");
        setLoading(false);
        return;
      }
      const { latitude: safeLat, longitude: safeLon } = coordinates;

      const requestDataUnit = normalizeTemperatureUnit(requestUnit);
      const apiTemperatureUnit = getApiTemperatureUnit(requestDataUnit);
      const requestId = requestIdRef.current + 1;
      const signature = `${safeLat},${safeLon},${requestDataUnit},${climateEnabled ? 1 : 0}`;

      requestIdRef.current = requestId;
      abortInFlightRequest();
      const controller = new AbortController();
      inFlightRequestRef.current = controller;
      lastRequestedSignatureRef.current = signature;

      if (!isMountedRef.current) return;
      setLoading(true);
      setError(null);
      setLocationNotice(fallbackNotice || null);
      setClimateComparison(null);

      try {
        const [weatherData, aqi] = await Promise.all([
          fetchWeather(safeLat, safeLon, {
            signal: controller.signal,
            temperatureUnit: apiTemperatureUnit,
            windSpeedUnit: getApiWindSpeedUnit(requestDataUnit),
            precipitationUnit: getApiPrecipUnit(requestDataUnit),
          }),
          fetchAirQuality(safeLat, safeLon, { signal: controller.signal }),
        ]);

        const historicalAverage = climateEnabled
          ? await fetchHistoricalTemperatureAverage(
              safeLat,
              safeLon,
              weatherData?.timezone,
              {
                signal: controller.signal,
                temperatureUnit: apiTemperatureUnit,
              }
            )
          : null;

        if (requestId !== requestIdRef.current) {
          return;
        }

        const resolvedName =
          name || getFallbackLocationName(weatherData, safeLat, safeLon);
        const normalizedName = normalizeLocationName(
          resolvedName,
          DEFAULT_LOCATION.name
        );
        const normalizedCountry = normalizeLocationName(
          country,
          DEFAULT_LOCATION.country
        );
        if (!isMountedRef.current) return;
        setLastRequest({
          lat: safeLat,
          lon: safeLon,
          name: normalizedName,
          country: normalizedCountry,
          unit: requestDataUnit,
        });
        const currentTemperature = Number(weatherData?.current?.temperature_2m);
        const historicalTemperature = Number(
          historicalAverage?.averageTemperature
        );
        const climateDelta =
          Number.isFinite(currentTemperature) &&
          Number.isFinite(historicalTemperature)
            ? currentTemperature - historicalTemperature
            : null;

        setWeatherDataUnit(requestDataUnit);
        setWeather({ ...weatherData, aqi });
        setLocation({
          lat: safeLat,
          lon: safeLon,
          name: normalizedName,
          country: normalizedCountry,
        });
        persistLocation(
          safeLat,
          safeLon,
          normalizedName,
          normalizedCountry
        );
        if (!isMountedRef.current) return;
        setClimateComparison(
          historicalAverage && Number.isFinite(climateDelta)
            ? {
                ...historicalAverage,
                difference: climateDelta,
                differenceUnit: requestDataUnit,
              }
            : null
        );
      } catch (error) {
        if (
          requestId === requestIdRef.current &&
          isMountedRef.current &&
          error?.name !== "AbortError"
        ) {
          setError(error.message || "Could not load weather");
        }
      } finally {
        if (requestId === requestIdRef.current) {
          if (isMountedRef.current) {
            setLoading(false);
          }
          if (inFlightRequestRef.current === controller) {
            inFlightRequestRef.current = null;
          }
        }
      }
    },
    [unit, climateEnabled, abortInFlightRequest]
  );

  const scheduleWeatherLoad = useCallback(
    (lat, lon, name, country, requestUnit = unit, options = {}) => {
      if (!isMountedRef.current) return;
      loadWeather(lat, lon, name, country, requestUnit, options);
    },
    [loadWeather, unit]
  );

  const loadDefaultLocation = useCallback(
    (requestUnit = unit, fallbackNotice = LOCATION_FALLBACK_NOTICE) => {
      scheduleWeatherLoad(
        DEFAULT_LOCATION.lat,
        DEFAULT_LOCATION.lon,
        DEFAULT_LOCATION.name,
        DEFAULT_LOCATION.country,
        requestUnit,
        { fallbackNotice }
      );
    },
    [scheduleWeatherLoad, unit]
  );

  const scheduleWeatherLoadAsync = useCallback(
    (lat, lon, name, country, requestUnit = unit, options = {}) => {
      queueMicrotask(() => {
        scheduleWeatherLoad(lat, lon, name, country, requestUnit, options);
      });
    },
    [scheduleWeatherLoad, unit]
  );

  const requestCurrentPositionWithFallback = useCallback(
    ({
      requestUnit = unit,
      fallbackNotice = LOCATION_FALLBACK_NOTICE,
      onSuccess,
      onFallback,
      trackCurrentLookup = false,
    }) => {
      const normalizedRequestUnit = normalizeTemperatureUnit(requestUnit);
      const finishLookup = () => {
        if (!trackCurrentLookup || !isMountedRef.current) {
          return;
        }
        setIsLocatingCurrent(false);
      };
      const finalizeLookup = (handler, ...args) => {
        handler?.(...args);
        finishLookup();
      };

      if (!hasGeolocationSupport()) {
        finalizeLookup(onFallback, normalizedRequestUnit, fallbackNotice);
        return;
      }

      if (trackCurrentLookup) {
        setIsLocatingCurrent(true);
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMountedRef.current) {
            return;
          }

          const coordinates = parseCoordinates(
            position?.coords?.latitude,
            position?.coords?.longitude
          );
          if (!coordinates) {
            finalizeLookup(onFallback, normalizedRequestUnit, fallbackNotice);
            return;
          }

          finalizeLookup(onSuccess, coordinates, normalizedRequestUnit);
        },
        () => {
          if (!isMountedRef.current) {
            return;
          }
          finalizeLookup(onFallback, normalizedRequestUnit, fallbackNotice);
        },
        { timeout: GEOLOCATION_TIMEOUT_MS }
      );
    },
    [unit]
  );

  const loadCurrentLocation = useCallback(
    (options = {}) => {
      const requestUnit = options.unit || unit;
      const fallbackNotice = options.fallbackNotice || LOCATION_FALLBACK_NOTICE;

      requestCurrentPositionWithFallback({
        requestUnit,
        fallbackNotice,
        trackCurrentLookup: true,
        onSuccess: ({ latitude, longitude }, normalizedRequestUnit) => {
          scheduleWeatherLoad(
            latitude,
            longitude,
            undefined,
            undefined,
            normalizedRequestUnit
          );
        },
        onFallback: (normalizedRequestUnit, fallbackNoticeMessage) => {
          loadDefaultLocation(normalizedRequestUnit, fallbackNoticeMessage);
        },
      });
    },
    [scheduleWeatherLoad, loadDefaultLocation, requestCurrentPositionWithFallback, unit]
  );

  const retryWeather = useCallback(() => {
    const fallbackRequest = lastRequest || DEFAULT_LOCATION;
    const retryUnit = normalizeTemperatureUnit(fallbackRequest.unit || unit);

    scheduleWeatherLoad(
      fallbackRequest.lat,
      fallbackRequest.lon,
      fallbackRequest.name,
      fallbackRequest.country,
      retryUnit
    );
  }, [lastRequest, scheduleWeatherLoad, unit]);

  useEffect(() => {
    const persisted = getPersistedLocation();
    if (persisted) {
      scheduleWeatherLoadAsync(
        persisted.lat,
        persisted.lon,
        persisted.name || DEFAULT_LOCATION.name,
        persisted.country || DEFAULT_LOCATION.country,
        unit,
        { fallbackNotice: SAVED_LOCATION_NOTICE }
      );
    } else {
      const fallbackTimer = setTimeout(() => {
        scheduleWeatherLoadAsync(
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country,
          unit,
          { fallbackNotice: LOCATION_FALLBACK_NOTICE }
        );
      }, LOCATION_FALLBACK_DELAY_MS);

      requestCurrentPositionWithFallback({
        requestUnit: unit,
        fallbackNotice: LOCATION_FALLBACK_NOTICE,
        onSuccess: ({ latitude, longitude }) => {
          clearTimeout(fallbackTimer);
          scheduleWeatherLoadAsync(latitude, longitude);
        },
        onFallback: () => {
          clearTimeout(fallbackTimer);
          loadDefaultLocation(unit, LOCATION_FALLBACK_NOTICE);
        },
      });

      return () => {
        clearTimeout(fallbackTimer);
        abortInFlightRequest();
      };
    }
  }, [
    unit,
    scheduleWeatherLoadAsync,
    abortInFlightRequest,
    requestCurrentPositionWithFallback,
    loadDefaultLocation,
  ]);

  const hasLocation = location !== null;
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const locationName = location?.name;
  const locationCountry = location?.country;

  useEffect(() => {
    if (hasLocation) {
      const nextSignature = `${locationLat},${locationLon},${unit},${climateEnabled ? 1 : 0}`;
      if (nextSignature !== lastRequestedSignatureRef.current) {
        scheduleWeatherLoadAsync(
          locationLat,
          locationLon,
          locationName,
          locationCountry,
          unit
        );
      }
    }
  }, [
    unit,
    climateEnabled,
    hasLocation,
    locationLat,
    locationLon,
    locationName,
    locationCountry,
    scheduleWeatherLoadAsync,
  ]);

  useEffect(() => {
    return () => {
      abortInFlightRequest();
    };
  }, [abortInFlightRequest]);

  return {
    weather,
    weatherDataUnit,
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
