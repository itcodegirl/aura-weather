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
import { shouldAutoRefreshWeather } from "./weatherRefreshPolicy.js";
import {
  readCachedWeatherSnapshot,
  writeCachedWeatherSnapshot,
} from "../services/weatherSnapshotCache";

const DEFAULT_TRUST_META = {
  weatherFetchedAt: null,
  aqiFetchedAt: null,
  aqiStatus: "idle",
  alertsFetchedAt: null,
  alertsStatus: "idle",
  forecastStatus: "idle",
  cacheStatus: "idle",
  cacheCapturedAt: null,
  cacheRestoredAt: null,
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

function isBrowserOffline() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    navigator.onLine === false
  );
}

function getForecastFailureMessage(error) {
  if (isBrowserOffline()) {
    return "Browser is offline.";
  }

  // AbortSignal.timeout rejects with a TimeoutError (not AbortError),
  // so a slow network gets an actionable message instead of the
  // generic "unavailable".
  if (error?.name === "TimeoutError") {
    return "Open-Meteo forecast timed out. Check your connection and retry.";
  }

  const status = toFiniteNumber(error?.status);
  if (status !== null) {
    return `Open-Meteo forecast is unavailable (${status}).`;
  }

  const detail = getErrorMessage(error, "");
  if (detail) {
    return `Open-Meteo forecast is unavailable: ${detail}`;
  }

  return "Open-Meteo forecast is unavailable.";
}

function buildBaseWeatherState(weatherData) {
  return {
    ...weatherData,
    aqi: null,
    alerts: [],
    alertsStatus: "idle",
  };
}

function buildFreshTrustMeta(fetchedAt) {
  return {
    ...DEFAULT_TRUST_META,
    weatherFetchedAt: fetchedAt,
    forecastStatus: "ready",
  };
}

function buildCachedTrustMeta(snapshot, restoredAt = Date.now()) {
  const snapshotTrustMeta =
    snapshot?.trustMeta && typeof snapshot.trustMeta === "object"
      ? snapshot.trustMeta
      : {};
  return {
    ...DEFAULT_TRUST_META,
    ...snapshotTrustMeta,
    forecastStatus: "cached",
    cacheStatus: "restored",
    cacheCapturedAt: toFiniteNumber(snapshot?.cachedAt),
    cacheRestoredAt: restoredAt,
  };
}

export function useWeatherData(location, options = {}) {
  const { climateEnabled = true, enabled = true } = options;
  const locationLat = location?.lat;
  const locationLon = location?.lon;
  const weatherDataUnit = WEATHER_SOURCE_UNIT;

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(() =>
    enabled && Boolean(parseCoordinates(locationLat, locationLon))
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

      const nextTrustMeta = {
        ...DEFAULT_TRUST_META,
        weatherFetchedAt,
        forecastStatus: "ready",
        aqiFetchedAt: toFiniteNumber(nextAqi) === null ? null : Date.now(),
        aqiStatus: toFiniteNumber(nextAqi) === null ? "unavailable" : "ready",
        alertsFetchedAt:
          alertsPayload?.status === ALERTS_STATUS.ready ? Date.now() : null,
        alertsStatus:
          typeof alertsPayload?.status === "string"
            ? alertsPayload.status
            : ALERTS_STATUS.unavailable,
      };

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

        writeCachedWeatherSnapshot({
          coordinates,
          weather: nextWeather,
          trustMeta: nextTrustMeta,
        });

        return nextWeather;
      });

      setTrustMeta(nextTrustMeta);
    } finally {
      if (inFlightRequestRef.current === controller) {
        inFlightRequestRef.current = null;
      }
    }
  }, []);

  const requestWeatherData = useCallback(async () => {
    if (!enabled) {
      abortInFlightRequest();
      resetClimateComparison();
      lastFetchedCoordsRef.current = null;
      setWeather(null);
      setTrustMeta(DEFAULT_TRUST_META);
      setError(null);
      setLoading(false);
      return;
    }

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
    const cachedSnapshot = readCachedWeatherSnapshot(coordinates);

    abortInFlightRequest();
    resetClimateComparison();

    if (isBrowserOffline() && cachedSnapshot) {
      setWeather(cachedSnapshot.weather);
      setTrustMeta(buildCachedTrustMeta(cachedSnapshot));
      lastFetchedCoordsRef.current = {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
      setError(getForecastFailureMessage());
      setLoading(false);
      void requestClimateComparison({
        coordinates,
        weatherData: cachedSnapshot.weather,
      });
      return;
    }

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

      const baseWeather = buildBaseWeatherState(weatherData);
      const baseTrustMeta = buildFreshTrustMeta(fetchedAt);

      setWeather(baseWeather);
      setTrustMeta(baseTrustMeta);
      writeCachedWeatherSnapshot({
        coordinates,
        weather: baseWeather,
        trustMeta: baseTrustMeta,
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
        if (cachedSnapshot) {
          setWeather(cachedSnapshot.weather);
          setTrustMeta(buildCachedTrustMeta(cachedSnapshot));
          lastFetchedCoordsRef.current = {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          };
          setError(getForecastFailureMessage(requestError));
          void requestClimateComparison({
            coordinates,
            weatherData: cachedSnapshot.weather,
          });
        } else {
          setError(getForecastFailureMessage(requestError));
        }
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
    enabled,
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
    if (!enabled) {
      return;
    }

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
    enabled,
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

  // ---- Automatic refresh on natural opportunities -------------------
  // The dashboard previously never refetched on its own: a tab left
  // open overnight kept showing yesterday's forecast, and a connection
  // drop left the error banner up even after connectivity returned.
  // Two listeners close that gap; the decision logic itself lives in
  // weatherRefreshPolicy.js. Same-coordinate refreshes keep the current
  // data visible behind the existing "Refreshing" pill, so this never
  // blanks the screen.
  const refreshSnapshotRef = useRef({ weatherFetchedAt: null, forecastStatus: "idle", hasError: false });
  useEffect(() => {
    refreshSnapshotRef.current = {
      weatherFetchedAt: trustMeta.weatherFetchedAt,
      forecastStatus: trustMeta.forecastStatus,
      hasError: Boolean(error),
    };
  }, [trustMeta.weatherFetchedAt, trustMeta.forecastStatus, error]);
  const lastAutoRefreshAttemptRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }

    const attemptAutoRefresh = () => {
      const snapshot = refreshSnapshotRef.current;
      const isVisible =
        typeof document === "undefined" ||
        document.visibilityState !== "hidden";
      const decision = shouldAutoRefreshWeather({
        nowMs: Date.now(),
        weatherFetchedAt: snapshot.weatherFetchedAt,
        forecastStatus: snapshot.forecastStatus,
        hasError: snapshot.hasError,
        isOffline: isBrowserOffline(),
        isVisible,
        lastAttemptAt: lastAutoRefreshAttemptRef.current,
      });

      if (!decision) {
        return;
      }

      lastAutoRefreshAttemptRef.current = Date.now();
      void requestWeatherData();
    };

    const handleOnline = () => attemptAutoRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        attemptAutoRefresh();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, requestWeatherData]);

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
