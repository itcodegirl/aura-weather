import { useState, useEffect, useCallback, useRef } from "react";
import {
  ALERTS_STATUS,
  fetchWeather,
  fetchAirQuality,
  fetchHistoricalTemperatureAverage,
  fetchSevereWeatherAlerts,
} from "../api";
import {
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  normalizeTemperatureUnit,
  parseCoordinates,
} from "../utils/weatherUnits";

const DEFAULT_TRUST_META = {
  weatherFetchedAt: null,
  aqiFetchedAt: null,
  climateFetchedAt: null,
  climateStatus: "idle",
  alertsFetchedAt: null,
  alertsStatus: "idle",
};

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

function isAbortError(error) {
  return error?.name === "AbortError";
}

function buildClimateComparison(weatherData, historicalAverage, weatherDataUnit) {
  const currentTemperature = Number(weatherData?.current?.temperature);
  const historicalTemperature = Number(historicalAverage?.averageTemperature);
  const climateDelta = getDifference(currentTemperature, historicalTemperature);

  if (!historicalAverage || !Number.isFinite(climateDelta)) {
    return null;
  }

  return {
    ...historicalAverage,
    difference: climateDelta,
    differenceUnit: weatherDataUnit,
  };
}

function buildBaseWeatherState(weatherData) {
  return {
    ...weatherData,
    aqi: null,
    alerts: [],
    alertsStatus: "idle",
  };
}

export function useWeatherData(location, unit = "F", options = {}) {
  const { climateEnabled = true } = options;
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const weatherDataUnit = normalizeTemperatureUnit(unit);

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(() =>
    Boolean(parseCoordinates(locationLat, locationLon))
  );
  const [error, setError] = useState(null);
  const [climateComparison, setClimateComparison] = useState(null);
  const [trustMeta, setTrustMeta] = useState(DEFAULT_TRUST_META);

  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const climateRequestRef = useRef(null);
  const climateRequestIdRef = useRef(0);
  const climateEnabledRef = useRef(climateEnabled);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    climateEnabledRef.current = climateEnabled;
  }, [climateEnabled]);

  const abortInFlightRequest = useCallback(() => {
    if (!inFlightRequestRef.current) {
      return;
    }

    inFlightRequestRef.current.abort();
    inFlightRequestRef.current = null;
  }, []);

  const abortClimateRequest = useCallback(() => {
    if (!climateRequestRef.current) {
      return;
    }

    climateRequestRef.current.abort();
    climateRequestRef.current = null;
  }, []);

  const requestClimateComparison = useCallback(async ({
    coordinates,
    weatherData,
    weatherFetchedAt,
    apiTemperatureUnit = "fahrenheit",
  }) => {
    if (!climateEnabledRef.current) {
      setClimateComparison(null);
      setTrustMeta((currentTrustMeta) => ({
        ...currentTrustMeta,
        climateFetchedAt: null,
        climateStatus: "disabled",
      }));
      return;
    }

    const requestId = climateRequestIdRef.current + 1;
    climateRequestIdRef.current = requestId;

    abortClimateRequest();

    const controller = new AbortController();
    climateRequestRef.current = controller;

    setTrustMeta((currentTrustMeta) => ({
      ...currentTrustMeta,
      climateStatus: "loading",
    }));

    try {
      const historicalAverage = await fetchHistoricalTemperatureAverage(
        coordinates.latitude,
        coordinates.longitude,
        weatherData?.meta?.timezone,
        {
          signal: controller.signal,
          temperatureUnit: apiTemperatureUnit,
        }
      );

      if (
        requestId !== climateRequestIdRef.current ||
        !isMountedRef.current
      ) {
        return;
      }

      const nextClimateComparison = buildClimateComparison(
        weatherData,
        historicalAverage,
        weatherDataUnit
      );

      setClimateComparison(nextClimateComparison);
      setTrustMeta((currentTrustMeta) => ({
        ...currentTrustMeta,
        weatherFetchedAt,
        climateFetchedAt: nextClimateComparison ? Date.now() : null,
        climateStatus: nextClimateComparison ? "ready" : "unavailable",
      }));
    } catch (climateError) {
      if (
        requestId !== climateRequestIdRef.current ||
        isAbortError(climateError) ||
        !isMountedRef.current
      ) {
        return;
      }

      setClimateComparison(null);
      setTrustMeta((currentTrustMeta) => ({
        ...currentTrustMeta,
        climateFetchedAt: null,
        climateStatus: "unavailable",
      }));
    } finally {
      if (climateRequestRef.current === controller) {
        climateRequestRef.current = null;
      }
    }
  }, [abortClimateRequest, weatherDataUnit]);

  const applySupplementalData = useCallback(async ({
    requestId,
    controller,
    coordinates,
    weatherFetchedAt,
  }) => {
    const supplementalTasks = [
      fetchAirQuality(coordinates.latitude, coordinates.longitude, {
        signal: controller.signal,
      }).then((aqi) => ({
        kind: "aqi",
        value: aqi,
      })),
      fetchSevereWeatherAlerts(coordinates.latitude, coordinates.longitude, {
        signal: controller.signal,
      }).then((alerts) => ({
        kind: "alerts",
        value: alerts,
      })),
    ];

    try {
      const results = await Promise.allSettled(supplementalTasks);
      if (requestId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }

      let nextAqi = null;
      let alertsPayload = null;

      for (const result of results) {
        if (result.status !== "fulfilled") {
          if (isAbortError(result.reason)) {
            return;
          }
          continue;
        }

        if (result.value.kind === "aqi") {
          nextAqi = result.value.value;
        }

        if (result.value.kind === "alerts") {
          alertsPayload = result.value.value;
        }
      }

      setWeather((currentWeather) => {
        if (!currentWeather) {
          return currentWeather;
        }

        const nextWeather = { ...currentWeather };
        nextWeather.aqi = nextAqi;

        if (alertsPayload) {
          nextWeather.alerts = Array.isArray(alertsPayload?.alerts)
            ? alertsPayload.alerts
            : [];
          nextWeather.alertsStatus =
            typeof alertsPayload?.status === "string"
              ? alertsPayload.status
              : ALERTS_STATUS.unavailable;
        }

        return nextWeather;
      });

      setTrustMeta((currentTrustMeta) => ({
        ...currentTrustMeta,
        weatherFetchedAt,
        aqiFetchedAt: Number.isFinite(Number(nextAqi)) ? Date.now() : null,
        alertsFetchedAt:
          alertsPayload?.status === ALERTS_STATUS.ready ? Date.now() : null,
        alertsStatus:
          typeof alertsPayload?.status === "string"
            ? alertsPayload.status
            : currentTrustMeta.alertsStatus,
      }));
    } finally {
      if (inFlightRequestRef.current === controller) {
        inFlightRequestRef.current = null;
      }
    }
  }, []);

  const requestWeatherData = useCallback(async () => {
    const coordinates = parseCoordinates(locationLat, locationLon);

    if (!coordinates) {
      if (typeof locationLat === "number" || typeof locationLon === "number") {
        setError("Invalid location coordinates");
      }
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const apiTemperatureUnit = "fahrenheit";
    const requestWindSpeedUnit = getApiWindSpeedUnit();

    abortInFlightRequest();
    abortClimateRequest();

    const controller = new AbortController();
    inFlightRequestRef.current = controller;

    setLoading(true);
    setError(null);
    setClimateComparison(null);

    let shouldKeepController = false;

    try {
      const weatherData = await fetchWeather(
        coordinates.latitude,
        coordinates.longitude,
        {
          signal: controller.signal,
          temperatureUnit: apiTemperatureUnit,
          windSpeedUnit: requestWindSpeedUnit,
          precipitationUnit: getApiPrecipUnit(weatherDataUnit),
        }
      );

      if (requestId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }

      const fetchedAt = Date.now();

      setWeather(buildBaseWeatherState(weatherData));
      setTrustMeta({
        weatherFetchedAt: fetchedAt,
        aqiFetchedAt: null,
        climateFetchedAt: null,
        climateStatus: climateEnabledRef.current ? "loading" : "disabled",
        alertsFetchedAt: null,
        alertsStatus: "idle",
      });
      setLoading(false);

      shouldKeepController = true;
      void applySupplementalData({
        requestId,
        controller,
        coordinates,
        weatherFetchedAt: fetchedAt,
      });
      void requestClimateComparison({
        coordinates,
        weatherData,
        weatherFetchedAt: fetchedAt,
        apiTemperatureUnit,
      });
    } catch (requestError) {
      if (
        requestId === requestIdRef.current &&
        !isAbortError(requestError) &&
        isMountedRef.current
      ) {
        setError(getErrorMessage(requestError, "Could not load weather"));
      }
    } finally {
      if (requestId === requestIdRef.current && isMountedRef.current) {
        setLoading(false);
      }
      if (!shouldKeepController && inFlightRequestRef.current === controller) {
        inFlightRequestRef.current = null;
      }
    }
  }, [
    abortClimateRequest,
    abortInFlightRequest,
    applySupplementalData,
    locationLat,
    locationLon,
    requestClimateComparison,
    weatherDataUnit,
  ]);

  useEffect(() => {
    Promise.resolve().then(() => {
      void requestWeatherData();
    });

    return () => {
      abortInFlightRequest();
      abortClimateRequest();
    };
  }, [abortClimateRequest, abortInFlightRequest, requestWeatherData]);

  useEffect(() => {
    if (climateEnabled) {
      const coordinates = parseCoordinates(locationLat, locationLon);
      if (
        coordinates &&
        weather &&
        !climateComparison &&
        trustMeta.climateStatus !== "loading"
      ) {
        Promise.resolve().then(() => {
          void requestClimateComparison({
            coordinates,
            weatherData: weather,
            weatherFetchedAt: trustMeta.weatherFetchedAt,
          });
        });
      }
      return;
    }

    abortClimateRequest();
  }, [
    abortClimateRequest,
    climateComparison,
    climateEnabled,
    locationLat,
    locationLon,
    requestClimateComparison,
    trustMeta.climateStatus,
    trustMeta.weatherFetchedAt,
    weather,
  ]);

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
