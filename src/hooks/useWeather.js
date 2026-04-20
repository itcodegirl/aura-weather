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
  normalizeLatitude,
  normalizeLongitude,
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
const LOCATION_FALLBACK_DELAY_MS = 6000;
const DEFAULT_DATA_UNIT = "F";
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;

function normalizeUnit(value) {
  return value === "C" ? "C" : "F";
}

function getPersistedLocation() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const saved = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const lat = Number(parsed?.lat);
    const lon = Number(parsed?.lon);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      return null;
    }

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
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
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

function parseLatitude(lat) {
  const numeric = normalizeLatitude(lat);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric < MIN_LATITUDE || numeric > MAX_LATITUDE) {
    return null;
  }
  return numeric;
}

function parseLongitude(lon) {
  const numeric = normalizeLongitude(lon);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric < MIN_LONGITUDE || numeric > MAX_LONGITUDE) {
    return null;
  }
  return numeric;
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

      const safeLat = parseLatitude(lat);
      const safeLon = parseLongitude(lon);
      const { fallbackNotice } = loadOptions;
      if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) {
        setError("Invalid location coordinates");
        setLoading(false);
        return;
      }

      const requestDataUnit = normalizeUnit(requestUnit);
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
      setLastRequest({ lat: safeLat, lon: safeLon, name, country, unit: requestDataUnit });
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
        if (!isMountedRef.current) return;
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
          name: resolvedName,
          country: country || "",
        });
        persistLocation(safeLat, safeLon, resolvedName, country || "");
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

  const scheduleWeatherLoadAsync = useCallback(
    (lat, lon, name, country, requestUnit = unit, options = {}) => {
      queueMicrotask(() => {
        scheduleWeatherLoad(lat, lon, name, country, requestUnit, options);
      });
    },
    [scheduleWeatherLoad, unit]
  );

  const loadCurrentLocation = useCallback(
    (options = {}) => {
      const requestUnit = normalizeUnit(options.unit || unit);
      const fallbackNotice = options.fallbackNotice || LOCATION_FALLBACK_NOTICE;

      if (!navigator.geolocation) {
        setIsLocatingCurrent(false);
        scheduleWeatherLoad(
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
          if (!isMountedRef.current) return;
          const { latitude, longitude } = pos.coords;
          scheduleWeatherLoad(
            latitude,
            longitude,
            undefined,
            undefined,
            requestUnit
          );
          setIsLocatingCurrent(false);
        },
        () => {
          if (!isMountedRef.current) return;
          setIsLocatingCurrent(false);
          scheduleWeatherLoad(
            DEFAULT_LOCATION.lat,
            DEFAULT_LOCATION.lon,
            DEFAULT_LOCATION.name,
            DEFAULT_LOCATION.country,
            requestUnit,
            { fallbackNotice }
          );
        },
        { timeout: GEOLOCATION_TIMEOUT_MS }
      );
    },
    [scheduleWeatherLoad, unit]
  );

  const retryWeather = useCallback(() => {
    const fallbackRequest = lastRequest || DEFAULT_LOCATION;
    const retryUnit = normalizeUnit(fallbackRequest.unit || unit);

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

      if (!navigator.geolocation) {
        clearTimeout(fallbackTimer);
        scheduleWeatherLoadAsync(
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country,
          unit,
          { fallbackNotice: LOCATION_FALLBACK_NOTICE }
        );
        return () => {
          clearTimeout(fallbackTimer);
          abortInFlightRequest();
        };
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(fallbackTimer);
          const { latitude, longitude } = pos.coords;
          scheduleWeatherLoadAsync(latitude, longitude, undefined, undefined, unit);
        },
        () => {
          clearTimeout(fallbackTimer);
          scheduleWeatherLoadAsync(
            DEFAULT_LOCATION.lat,
            DEFAULT_LOCATION.lon,
            DEFAULT_LOCATION.name,
            DEFAULT_LOCATION.country,
            unit,
            { fallbackNotice: LOCATION_FALLBACK_NOTICE }
          );
        },
        { timeout: GEOLOCATION_TIMEOUT_MS }
      );

      return () => {
        clearTimeout(fallbackTimer);
        abortInFlightRequest();
      };
    }
  }, [unit, scheduleWeatherLoadAsync, abortInFlightRequest]);

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
