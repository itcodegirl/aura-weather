import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchWeather,
  fetchAirQuality,
  fetchHistoricalTemperatureAverage,
} from "../api";
import {
  getApiTemperatureUnit,
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  normalizeTemperatureUnit,
  parseCoordinates,
} from "../utils/weatherUnits";
import { DEFAULT_LOCATION, normalizeLocationName } from "./useLocation";

const DEFAULT_DATA_UNIT = "F";
const DEFAULT_WIND_DATA_UNIT = "mph";

function scheduleTask(callback) {
  if (typeof callback !== "function") return;
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  Promise.resolve()
    .then(callback)
    .catch(() => {
      // Keep async scheduling failures from leaking as unhandled rejections.
    });
}

function getErrorMessage(error, fallback) {
  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (error && typeof error === "object") {
    const maybeMessage = error.message;
    if (typeof maybeMessage === "string") {
      const trimmed = maybeMessage.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return fallback;
}

function getFallbackLocationName(weatherData, lat, lon) {
  const timezoneCity = weatherData?.meta?.timezone
    ?.split("/")
    .at(-1)
    ?.replace(/_/g, " ");
  return (
    timezoneCity ||
    `${Number(lat).toFixed(2)}\u00b0, ${Number(lon).toFixed(2)}\u00b0`
  );
}

export function useWeatherData(unit = "F", options = {}) {
  const {
    climateEnabled = true,
    location = null,
    onLocationResolved,
  } = options;

  const [weather, setWeather] = useState(null);
  const [weatherDataUnit, setWeatherDataUnit] = useState(DEFAULT_DATA_UNIT);
  const [weatherWindSpeedUnit, setWeatherWindSpeedUnit] = useState(
    DEFAULT_WIND_DATA_UNIT
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const lastRequestRef = useRef(null);
  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const lastRequestedSignatureRef = useRef("");
  const isMountedRef = useRef(false);
  const activeUnitRef = useRef(normalizeTemperatureUnit(unit));
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const locationName = location?.name;
  const locationCountry = location?.country;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeUnitRef.current = normalizeTemperatureUnit(unit);
  }, [unit]);

  const abortInFlightRequest = useCallback(() => {
    if (!inFlightRequestRef.current) return;
    inFlightRequestRef.current.abort();
    inFlightRequestRef.current = null;
  }, []);

  const loadWeather = useCallback(
    async (lat, lon, name, country, requestUnit, loadOptions = {}) => {
      if (!isMountedRef.current) return;

      const coordinates = parseCoordinates(lat, lon);
      const { skipIfSignatureMatches = false } = loadOptions;
      if (!coordinates) {
        setError("Invalid location coordinates");
        setLoading(false);
        return;
      }
      const { latitude: safeLat, longitude: safeLon } = coordinates;

      const requestDataUnit = normalizeTemperatureUnit(
        requestUnit ?? activeUnitRef.current
      );
      const apiTemperatureUnit = getApiTemperatureUnit(requestDataUnit);
      const requestWindSpeedUnit = getApiWindSpeedUnit(requestDataUnit);
      const requestName = normalizeLocationName(name);
      const requestCountry = normalizeLocationName(country);
      const requestId = requestIdRef.current + 1;
      const signature = `${safeLat},${safeLon},${requestDataUnit},${climateEnabled ? 1 : 0}`;
      if (
        skipIfSignatureMatches &&
        signature === lastRequestedSignatureRef.current
      ) {
        return;
      }

      requestIdRef.current = requestId;
      abortInFlightRequest();
      const controller = new AbortController();
      inFlightRequestRef.current = controller;
      lastRequestedSignatureRef.current = signature;

      if (!isMountedRef.current) return;
      setLoading(true);
      setError(null);
      lastRequestRef.current = {
        lat: safeLat,
        lon: safeLon,
        name: requestName,
        country: requestCountry,
        unit: requestDataUnit,
      };
      setClimateComparison(null);

      try {
        const [weatherData, aqi] = await Promise.all([
          fetchWeather(safeLat, safeLon, {
            signal: controller.signal,
            temperatureUnit: apiTemperatureUnit,
            windSpeedUnit: requestWindSpeedUnit,
            precipitationUnit: getApiPrecipUnit(requestDataUnit),
          }),
          fetchAirQuality(safeLat, safeLon, { signal: controller.signal }),
        ]);

        const historicalAverage = climateEnabled
          ? await fetchHistoricalTemperatureAverage(
              safeLat,
              safeLon,
              weatherData?.meta?.timezone,
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
          requestName || getFallbackLocationName(weatherData, safeLat, safeLon);
        const normalizedName = normalizeLocationName(
          resolvedName,
          DEFAULT_LOCATION.name
        );
        const normalizedCountry = normalizeLocationName(
          requestCountry,
          DEFAULT_LOCATION.country
        );
        if (!isMountedRef.current) return;
        lastRequestRef.current = {
          lat: safeLat,
          lon: safeLon,
          name: normalizedName,
          country: normalizedCountry,
          unit: requestDataUnit,
        };
        const currentTemperature = Number(weatherData?.current?.temperature);
        const historicalTemperature = Number(
          historicalAverage?.averageTemperature
        );
        const climateDelta =
          Number.isFinite(currentTemperature) &&
          Number.isFinite(historicalTemperature)
            ? currentTemperature - historicalTemperature
            : null;

        setWeatherDataUnit(requestDataUnit);
        setWeatherWindSpeedUnit(requestWindSpeedUnit);
        setWeather({ ...weatherData, aqi });
        onLocationResolved?.({
          lat: safeLat,
          lon: safeLon,
          name: normalizedName,
          country: normalizedCountry,
        });
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
      } catch (requestError) {
        if (
          requestId === requestIdRef.current &&
          isMountedRef.current &&
          requestError?.name !== "AbortError"
        ) {
          setError(getErrorMessage(requestError, "Could not load weather"));
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
    [climateEnabled, abortInFlightRequest, onLocationResolved]
  );

  const scheduleWeatherLoad = useCallback(
    (lat, lon, name, country, requestUnit, options = {}) => {
      if (!isMountedRef.current) return;
      const normalizedRequestUnit = normalizeTemperatureUnit(
        requestUnit ?? activeUnitRef.current
      );
      loadWeather(lat, lon, name, country, normalizedRequestUnit, options);
    },
    [loadWeather]
  );

  const scheduleWeatherLoadAsync = useCallback(
    (lat, lon, name, country, requestUnit, options = {}) => {
      const normalizedRequestUnit = normalizeTemperatureUnit(
        requestUnit ?? activeUnitRef.current
      );
      scheduleTask(() => {
        scheduleWeatherLoad(
          lat,
          lon,
          name,
          country,
          normalizedRequestUnit,
          options
        );
      });
    },
    [scheduleWeatherLoad]
  );

  const retryWeather = useCallback(() => {
    const fallbackRequest = lastRequestRef.current ?? DEFAULT_LOCATION;
    const retryUnit = normalizeTemperatureUnit(
      fallbackRequest.unit ?? activeUnitRef.current
    );

    scheduleWeatherLoad(
      fallbackRequest.lat,
      fallbackRequest.lon,
      normalizeLocationName(fallbackRequest.name, DEFAULT_LOCATION.name),
      normalizeLocationName(fallbackRequest.country, DEFAULT_LOCATION.country),
      retryUnit
    );
  }, [scheduleWeatherLoad]);

  useEffect(() => {
    if (typeof locationLat === "undefined" || typeof locationLon === "undefined") {
      return;
    }

    const coordinates = parseCoordinates(locationLat, locationLon);
    if (!coordinates) {
      return;
    }

    scheduleWeatherLoadAsync(
      coordinates.latitude,
      coordinates.longitude,
      normalizeLocationName(locationName),
      normalizeLocationName(locationCountry),
      unit,
      { skipIfSignatureMatches: true }
    );
  }, [
    locationLat,
    locationLon,
    locationName,
    locationCountry,
    unit,
    climateEnabled,
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
    weatherWindSpeedUnit,
    loading,
    error,
    climateComparison,
    loadWeather,
    scheduleWeatherLoad,
    scheduleWeatherLoadAsync,
    retryWeather,
    abortInFlightRequest,
  };
}
