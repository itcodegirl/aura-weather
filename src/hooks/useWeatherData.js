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
import {
  AUTO_REFRESH_POLL_INTERVAL_MS,
  AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
  shouldAutoRefreshWeather,
} from "./weatherRefreshPolicy.js";
import {
  readCachedWeatherSnapshot,
  writeCachedWeatherSnapshot,
} from "../services/weatherSnapshotCache";
import { claimForecastPreload } from "../api/forecastPreload.js";

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

// When the network is down or the refresh failed, a snapshot older
// than the default 12h freshness window is still better than the
// global error screen — the trust pill labels exactly how old it is.
// Two days is the ceiling: beyond that a forecast is misinformation.
const DEGRADED_SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

/*
 * A degraded snapshot can be up to DEGRADED_SNAPSHOT_MAX_AGE_MS (48h) old
 * and carries whatever NWS alerts were active when it was captured.
 * Replaying those verbatim is the one place in this app where stale data
 * has physical-safety consequences: AlertsCard renders a restored alert in
 * its live branch — event name, critical priority badge, and an
 * "Until <time>" that has already passed — with no freshness qualifier of
 * its own. Live fetches cannot reach this state, because NWS
 * /alerts/active only ever returns currently-active alerts, so the guard
 * belongs here on the restore path.
 *
 * An alert carries its own expiry, so one still inside its window is
 * genuinely still in force and is kept. Anything past `endsAt` is dropped.
 * If that empties a list that had entries, the channel reports
 * `unavailable` rather than falling through to AlertsCard's "No active
 * severe alerts" — silence would be a fresh claim we cannot back offline.
 * An alert with no parseable expiry is dropped for the same reason.
 */
function revalidateRestoredAlerts(weather, nowMs = Date.now()) {
  const alerts = Array.isArray(weather?.alerts) ? weather.alerts : null;
  if (!alerts || alerts.length === 0) {
    return weather;
  }

  const stillActive = alerts.filter((alert) => {
    const expiresAt = Date.parse(alert?.endsAt);
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  });

  if (stillActive.length === alerts.length) {
    return weather;
  }

  return {
    ...weather,
    alerts: stillActive,
    alertsStatus:
      stillActive.length > 0 ? weather.alertsStatus : ALERTS_STATUS.unavailable,
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
  const {
    climateEnabled = true,
    enabled = true,
    backgroundRefreshEnabled = true,
  } = options;
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
    baseWeather,
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

      // The requestId guard above proves the weather state still holds
      // this request's base snapshot (every other writer bumps the id
      // first), so the merge is computed as a plain value. The cache
      // write must stay outside the setState updater: updaters have to
      // be pure — StrictMode invokes them twice — and a persistence
      // side effect inside one runs twice with them.
      const nextWeather = { ...baseWeather, aqi: nextAqi };

      if (alertsPayload) {
        nextWeather.alerts = Array.isArray(alertsPayload?.alerts)
          ? alertsPayload.alerts
          : [];
        nextWeather.alertsStatus =
          typeof alertsPayload?.status === "string"
            ? alertsPayload.status
            : ALERTS_STATUS.unavailable;
      }

      setWeather(nextWeather);
      setTrustMeta(nextTrustMeta);
      writeCachedWeatherSnapshot({
        coordinates,
        weather: nextWeather,
        trustMeta: nextTrustMeta,
      });
    } finally {
      if (inFlightRequestRef.current === controller) {
        inFlightRequestRef.current = null;
      }
    }
  }, []);

  const requestWeatherData = useCallback(async () => {
    if (!enabled) {
      // Invalidate any queued continuation from a prior request so a
      // late supplemental merge cannot resurrect state after this
      // reset clears it. This was previously guarded only by a null
      // check inside the setWeather updater.
      requestIdRef.current += 1;
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
    // Degraded paths (offline start, failed refresh) accept an older
    // snapshot than the happy path would ever render. Resolved lazily
    // so the wider read only happens when the fresh one came up empty.
    const readDegradedSnapshot = () =>
      cachedSnapshot ??
      readCachedWeatherSnapshot(coordinates, {
        maxAgeMs: DEGRADED_SNAPSHOT_MAX_AGE_MS,
      });

    abortInFlightRequest();
    resetClimateComparison();

    if (isBrowserOffline()) {
      const offlineSnapshot = readDegradedSnapshot();
      if (offlineSnapshot) {
        setWeather(revalidateRestoredAlerts(offlineSnapshot.weather));
        setTrustMeta(buildCachedTrustMeta(offlineSnapshot));
        lastFetchedCoordsRef.current = {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        };
        setError(getForecastFailureMessage());
        setLoading(false);
        void requestClimateComparison({
          coordinates,
          weatherData: offlineSnapshot.weather,
        });
        return;
      }
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
      // Adopt the boot-time preload when its coordinates match this
      // request (the cold-load path): the request was fired before React
      // mounted, so its round-trip overlapped app hydration. On a miss
      // this is null and we fetch as usual. The preloaded request carries
      // no abort signal, but the requestId guard below still discards its
      // result if a newer request has since superseded it.
      const preloadedForecast = claimForecastPreload(coordinates);
      const weatherData = await (preloadedForecast?.promise ??
        fetchWeather(coordinates.latitude, coordinates.longitude, {
          signal: controller.signal,
          temperatureUnit: API_TEMPERATURE_UNIT,
          windSpeedUnit: requestWindSpeedUnit,
          precipitationUnit: WEATHER_PRECIPITATION_UNIT,
        }));

      if (requestId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }

      // An adopted preload may have resolved well before this claim, so
      // the freshness stamp is the preload's real response time. Reading
      // the clock here instead would date old data as fetched now, and
      // this timestamp is both the displayed age and what is persisted
      // into the snapshot cache.
      const fetchedAt = preloadedForecast?.getRespondedAt() ?? Date.now();

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
        baseWeather,
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
        const fallbackSnapshot = readDegradedSnapshot();
        if (fallbackSnapshot) {
          setWeather(revalidateRestoredAlerts(fallbackSnapshot.weather));
          setTrustMeta(buildCachedTrustMeta(fallbackSnapshot));
          lastFetchedCoordsRef.current = {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
          };
          setError(getForecastFailureMessage(requestError));
          void requestClimateComparison({
            coordinates,
            weatherData: fallbackSnapshot.weather,
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
  // Two listeners plus a minute-level visible-tab check close that
  // gap; the decision logic itself lives in weatherRefreshPolicy.js.
  // Same-coordinate refreshes keep the current data visible behind the
  // existing "Refreshing" pill, so this never blanks the screen.
  const refreshSnapshotRef = useRef({ weatherFetchedAt: null, forecastStatus: "idle", hasError: false });
  useEffect(() => {
    refreshSnapshotRef.current = {
      weatherFetchedAt: trustMeta.weatherFetchedAt,
      forecastStatus: trustMeta.forecastStatus,
      hasError: Boolean(error),
    };
  }, [trustMeta.weatherFetchedAt, trustMeta.forecastStatus, error]);
  const lastAutoRefreshAttemptRef = useRef(null);

  // Hold the latest requestWeatherData in a ref so the auto-refresh effect
  // below can depend only on [backgroundRefreshEnabled, enabled]. Otherwise it
  // depends on requestWeatherData — which is recreated on every location
  // change — and tears down + reinstalls its online/visibilitychange listeners
  // and restarts the poll timer on each city switch.
  const requestWeatherDataRef = useRef(requestWeatherData);
  useEffect(() => {
    requestWeatherDataRef.current = requestWeatherData;
  }, [requestWeatherData]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }

    const attemptAutoRefresh = ({ minAttemptIntervalMs } = {}) => {
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
        ...(minAttemptIntervalMs !== undefined ? { minAttemptIntervalMs } : {}),
      });

      if (!decision) {
        return;
      }

      lastAutoRefreshAttemptRef.current = Date.now();
      void requestWeatherDataRef.current();
    };

    const handleOnline = () => attemptAutoRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        attemptAutoRefresh();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Visible-tab cadence: a dashboard that never loses focus (second
    // monitor, kiosk, installed PWA left open) fires neither listener
    // above, so a minute check runs the same policy with a calmer
    // retry floor. Suppressed for prefers-reduced-data users — they
    // keep the event-driven correctness without background spend.
    const pollTimerId = backgroundRefreshEnabled
      ? setInterval(
          () =>
            attemptAutoRefresh({
              minAttemptIntervalMs: AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
            }),
          AUTO_REFRESH_POLL_INTERVAL_MS
        )
      : null;
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollTimerId !== null) {
        clearInterval(pollTimerId);
      }
    };
  }, [backgroundRefreshEnabled, enabled]);

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
