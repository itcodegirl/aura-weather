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

const DEFAULT_DATA_UNIT = "F";

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

function getDifference(currentTemperature, historicalTemperature) {
  if (!Number.isFinite(currentTemperature) || !Number.isFinite(historicalTemperature)) {
    return null;
  }
  return currentTemperature - historicalTemperature;
}

export function useWeatherData(location, unit = "F", options = {}) {
  const { climateEnabled = true } = options;
  const locationLat = location?.lat;
  const locationLon = location?.lon;

  const [weather, setWeather] = useState(null);
  const [weatherDataUnit, setWeatherDataUnit] = useState(DEFAULT_DATA_UNIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const abortInFlightRequest = useCallback(() => {
    if (!inFlightRequestRef.current) {
      return;
    }

    inFlightRequestRef.current.abort();
    inFlightRequestRef.current = null;
  }, []);

  useEffect(() => {
    const coordinates = parseCoordinates(locationLat, locationLon);
    const requestUnit = normalizeTemperatureUnit(unit);

    if (!coordinates) {
      if (typeof locationLat === "number" || typeof locationLon === "number") {
        Promise.resolve().then(() => {
          setError("Invalid location coordinates");
          setLoading(false);
        });
      }
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const apiTemperatureUnit = getApiTemperatureUnit(requestUnit);
    const requestWindSpeedUnit = getApiWindSpeedUnit();

    abortInFlightRequest();

    const controller = new AbortController();
    inFlightRequestRef.current = controller;

    const runRequest = async () => {
      setLoading(true);
      setError(null);
      setClimateComparison(null);

      try {
        const [weatherData, aqi] = await Promise.all([
          fetchWeather(coordinates.latitude, coordinates.longitude, {
            signal: controller.signal,
            temperatureUnit: apiTemperatureUnit,
            windSpeedUnit: requestWindSpeedUnit,
            precipitationUnit: getApiPrecipUnit(requestUnit),
          }),
          fetchAirQuality(coordinates.latitude, coordinates.longitude, {
            signal: controller.signal,
          }),
        ]);

        const historicalAverage = climateEnabled
          ? await fetchHistoricalTemperatureAverage(
              coordinates.latitude,
              coordinates.longitude,
              weatherData?.meta?.timezone,
              {
                signal: controller.signal,
                temperatureUnit: apiTemperatureUnit,
              }
            )
          : null;

        if (requestId !== requestIdRef.current || !isMountedRef.current) {
          return;
        }

        const currentTemperature = Number(weatherData?.current?.temperature);
        const historicalTemperature = Number(historicalAverage?.averageTemperature);
        const climateDelta = getDifference(
          currentTemperature,
          historicalTemperature
        );

        setWeatherDataUnit(requestUnit);
        setWeather({ ...weatherData, aqi });

        setClimateComparison(
          historicalAverage && Number.isFinite(climateDelta)
            ? {
                ...historicalAverage,
                difference: climateDelta,
                differenceUnit: requestUnit,
              }
            : null
        );
      } catch (requestError) {
        if (
          requestId === requestIdRef.current &&
          requestError?.name !== "AbortError" &&
          isMountedRef.current
        ) {
          setError(getErrorMessage(requestError, "Could not load weather"));
        }
      } finally {
        if (requestId === requestIdRef.current && isMountedRef.current) {
          setLoading(false);
          if (inFlightRequestRef.current === controller) {
            inFlightRequestRef.current = null;
          }
        }
      }
    };

    queueMicrotask(() => {
      runRequest();
    });
  }, [
    locationLat,
    locationLon,
    unit,
    climateEnabled,
    refreshIndex,
    abortInFlightRequest,
  ]);

  useEffect(() => {
    return () => {
      abortInFlightRequest();
    };
  }, [abortInFlightRequest]);

  const retryWeather = useCallback(() => {
    setRefreshIndex((previous) => previous + 1);
    setLoading(true);
    setError(null);
  }, []);

  return {
    weather,
    weatherDataUnit,
    loading,
    error,
    climateComparison,
    retryWeather,
  };
}
