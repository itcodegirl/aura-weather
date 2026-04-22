import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchWeather,
  fetchAirQuality,
  fetchHistoricalTemperatureAverage,
} from "../api";
import {
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  normalizeTemperatureUnit,
  parseCoordinates,
} from "../utils/weatherUnits";


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
  const weatherDataUnit = normalizeTemperatureUnit(unit);

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const [trustMeta, setTrustMeta] = useState({
    weatherFetchedAt: null,
    aqiFetchedAt: null,
    climateFetchedAt: null,
  });

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

  const requestWeatherData = useCallback(async () => {
    const coordinates = parseCoordinates(locationLat, locationLon);

    if (!coordinates) {
      if (typeof locationLat === "number" || typeof locationLon === "number") {
        setError("Invalid location coordinates");
        setLoading(false);
      }
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const apiTemperatureUnit = "fahrenheit";
    const requestWindSpeedUnit = getApiWindSpeedUnit();

    abortInFlightRequest();

    const controller = new AbortController();
    inFlightRequestRef.current = controller;

    setLoading(true);
    setError(null);
    setClimateComparison(null);

    try {
      const [weatherData, aqi] = await Promise.all([
        fetchWeather(coordinates.latitude, coordinates.longitude, {
          signal: controller.signal,
          temperatureUnit: apiTemperatureUnit,
          windSpeedUnit: requestWindSpeedUnit,
          precipitationUnit: getApiPrecipUnit(weatherDataUnit),
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
      const climateDelta = getDifference(currentTemperature, historicalTemperature);
      const fetchedAt = Date.now();

      setWeather({ ...weatherData, aqi });
      setTrustMeta((previousMeta) => ({
        weatherFetchedAt: fetchedAt,
        aqiFetchedAt: fetchedAt,
        climateFetchedAt: historicalAverage ? fetchedAt : previousMeta.climateFetchedAt,
      }));

      setClimateComparison(
        historicalAverage && Number.isFinite(climateDelta)
          ? {
              ...historicalAverage,
              difference: climateDelta,
              differenceUnit: weatherDataUnit,
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
  }, [abortInFlightRequest, climateEnabled, locationLat, locationLon, weatherDataUnit]);

  useEffect(() => {
    Promise.resolve().then(() => {
      void requestWeatherData();
    });

    return () => {
      abortInFlightRequest();
    };
  }, [abortInFlightRequest, requestWeatherData]);

  const retryWeather = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    void requestWeatherData();
  }, [requestWeatherData]);

  return {
    weather,
    weatherDataUnit,
    loading,
    error,
    climateComparison,
    retryWeather,
    trustMeta,
  };
}
