import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ALERTS_STATUS,
  fetchWeather,
  fetchAirQuality,
  fetchSevereWeatherAlerts,
} from "../api";
import {
  getApiWindSpeedUnit,
  getApiPrecipUnit,
  parseCoordinates,
} from "../utils/weatherUnits";
import { toFiniteNumber } from "../utils/numbers";
import { useClimateComparison } from "./useClimateComparison";

const DEFAULT_TRUST_META = {
  weatherFetchedAt: null,
  aqiFetchedAt: null,
  alertsFetchedAt: null,
  alertsStatus: "idle",
};

// Forecast data is always fetched in Fahrenheit / inch units and converted
// client-side. Switching units in the UI must not trigger a refetch.
const WEATHER_SOURCE_UNIT = "F";
const WEATHER_PRECIPITATION_UNIT = getApiPrecipUnit(WEATHER_SOURCE_UNIT);
const API_TEMPERATURE_UNIT = "fahrenheit";

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

function isAbortError(error) {
  return error?.name === "AbortError";
}

function buildBaseWeatherState(weatherData) {
  return {
    ...weatherData,
    aqi: null,
    alerts: [],
    alertsStatus: "idle",
  };
}

export function useWeatherData(location, options = {}) {
  const { climateEnabled = true } = options;
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const weatherDataUnit = WEATHER_SOURCE_UNIT;

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(() =>
    Boolean(parseCoordinates(locationLat, locationLon))
  );
  const [error, setError] = useState(null);
  const [trustMeta, setTrustMeta] = useState(DEFAULT_TRUST_META);

  const requestIdRef = useRef(0);
  const inFlightRequestRef = useRef(null);
  const isMountedRef = useRef(false);
  // Tracks the coordinates of the most recent successful response so
  // the next request can decide whether to clear the existing weather
  // (different city → clear, so users never see Tokyo's name above
  // Chicago's numbers) or keep it visible during a same-city refresh.
  const lastFetchedCoordsRef = useRef(null);

  const {
    climateComparison,
    climateStatus,
    climateLastUpdatedAt,
    requestClimateComparison,
    abortClimateRequest,
    resetClimateComparison,
  } = useClimateComparison({
    enabled: climateEnabled,
    apiTemperatureUnit: API_TEMPERATURE_UNIT,
  });

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
        aqiFetchedAt: toFiniteNumber(nextAqi) === null ? null : Date.now(),
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

    const requestWindSpeedUnit = getApiWindSpeedUnit();

    abortInFlightRequest();
    resetClimateComparison();

    const controller = new AbortController();
    inFlightRequestRef.current = controller;

    // If the user switched cities (different lat/lon), drop the
    // existing weather state so the dashboard does not render the
    // previous city's numbers under the new city's name. A same-city
    // refresh keeps the existing snapshot visible behind a "Refreshing"
    // pill — that is the trust cue for an in-place update.
    const lastCoords = lastFetchedCoordsRef.current;
    const isSameLocation =
      lastCoords &&
      lastCoords.latitude === coordinates.latitude &&
      lastCoords.longitude === coordinates.longitude;
    if (!isSameLocation) {
      setWeather(null);
      setTrustMeta(DEFAULT_TRUST_META);
    }

    setLoading(true);
    setError(null);

    let shouldKeepController = false;

    try {
      const weatherData = await fetchWeather(
        coordinates.latitude,
        coordinates.longitude,
        {
          signal: controller.signal,
          temperatureUnit: API_TEMPERATURE_UNIT,
          windSpeedUnit: requestWindSpeedUnit,
          precipitationUnit: WEATHER_PRECIPITATION_UNIT,
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
        alertsFetchedAt: null,
        alertsStatus: "idle",
      });
      lastFetchedCoordsRef.current = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
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
    abortInFlightRequest,
    applySupplementalData,
    locationLat,
    locationLon,
    requestClimateComparison,
    resetClimateComparison,
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

  // When the user re-enables climate context after disabling it, fetch
  // the historical comparison for the existing weather snapshot rather
  // than refetching the forecast.
  useEffect(() => {
    if (!climateEnabled) {
      return;
    }
    const coordinates = parseCoordinates(locationLat, locationLon);
    if (
      !coordinates ||
      !weather ||
      climateComparison ||
      (climateStatus !== "idle" && climateStatus !== "disabled")
    ) {
      return;
    }
    Promise.resolve().then(() => {
      void requestClimateComparison({
        coordinates,
        weatherData: weather,
      });
    });
  }, [
    climateComparison,
    climateEnabled,
    climateStatus,
    locationLat,
    locationLon,
    requestClimateComparison,
    weather,
  ]);

  const retryWeather = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    void requestWeatherData();
  }, [requestWeatherData]);

  // Project climate state back into trustMeta so existing consumers keep
  // working without prop-shape churn.
  const compositeTrustMeta = useMemo(
    () => ({
      ...trustMeta,
      climateFetchedAt: climateLastUpdatedAt,
      climateStatus,
    }),
    [trustMeta, climateLastUpdatedAt, climateStatus]
  );

  return {
    weather,
    weatherDataUnit,
    loading,
    error,
    climateComparison,
    retryWeather,
    trustMeta: compositeTrustMeta,
  };
}
