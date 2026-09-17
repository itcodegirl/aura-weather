import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistoricalTemperatureAverage } from "../api";
import { isAbortError } from "../api/requestSignal.js";
import {
  describeClimatologyTarget,
  readCachedClimatology,
  writeCachedClimatology,
} from "../services/climatologyCache.js";
import { isBrowserOffline } from "../utils/network.js";
import { buildClimateComparison } from "./climateComparison";

const DEFAULT_API_TEMPERATURE_UNIT = "fahrenheit";

/**
 * Owns the historical-archive request lifecycle and exposes
 * comparison + status state. Consumers call requestClimateComparison
 * whenever a fresh forecast lands.
 *
 * The archive's answer is a 30-year normal for a place and a calendar
 * day, so it is read from the climatology cache first (see
 * climatologyCache.js): a hit costs no request and works offline, and a
 * fresh answer is written back for the next visit. The request itself is
 * unchanged on a miss.
 */
export function useClimateComparison(options = {}) {
  const { enabled = true, apiTemperatureUnit = DEFAULT_API_TEMPERATURE_UNIT } =
    options;

  const [climateComparison, setClimateComparison] = useState(null);
  const [climateStatus, setClimateStatus] = useState(
    enabled ? "idle" : "disabled"
  );
  const [climateLastUpdatedAt, setClimateLastUpdatedAt] = useState(null);

  const requestIdRef = useRef(0);
  const requestRef = useRef(null);
  const isMountedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const apiTemperatureUnitRef = useRef(apiTemperatureUnit);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    apiTemperatureUnitRef.current = apiTemperatureUnit;
  }, [apiTemperatureUnit]);

  const abortClimateRequest = useCallback(() => {
    if (!requestRef.current) {
      return;
    }
    requestRef.current.abort();
    requestRef.current = null;
  }, []);

  const requestClimateComparison = useCallback(
    async ({ coordinates, weatherData }) => {
      if (!enabledRef.current) {
        setClimateComparison(null);
        setClimateLastUpdatedAt(null);
        setClimateStatus("disabled");
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      abortClimateRequest();

      // The normal for this place and calendar day, if a visit this year
      // already fetched it. Checked before the offline gate on purpose:
      // a cached normal is the one climate answer that needs no network.
      const target = describeClimatologyTarget(weatherData?.meta?.timezone, Date.now());
      const cacheKey = target
        ? {
            coordinates,
            monthDay: target.monthDay,
            year: target.year,
            temperatureUnit: apiTemperatureUnitRef.current,
          }
        : null;
      const cachedAverage = cacheKey ? readCachedClimatology(cacheKey) : null;
      if (cachedAverage) {
        const next = buildClimateComparison(weatherData, cachedAverage, Date.now());
        setClimateComparison(next);
        setClimateLastUpdatedAt(next ? Date.now() : null);
        setClimateStatus(next ? "ready" : "unavailable");
        return;
      }

      // Offline, the archive request can only fail — resolve straight
      // to "unavailable" instead of spending a fetch plus its retry
      // cycle to learn the same thing.
      if (isBrowserOffline()) {
        setClimateComparison(null);
        setClimateLastUpdatedAt(null);
        setClimateStatus("unavailable");
        return;
      }

      const controller = new AbortController();
      requestRef.current = controller;

      setClimateStatus("loading");

      try {
        const historicalAverage = await fetchHistoricalTemperatureAverage(
          coordinates.latitude,
          coordinates.longitude,
          weatherData?.meta?.timezone,
          {
            signal: controller.signal,
            temperatureUnit: apiTemperatureUnitRef.current,
          }
        );

        if (
          requestId !== requestIdRef.current ||
          !isMountedRef.current
        ) {
          return;
        }

        if (historicalAverage && cacheKey) {
          writeCachedClimatology({ ...cacheKey, historicalAverage });
        }

        // The comparison reads today's forecast high, so it needs the
        // clock to know which daily entry is today.
        const next = buildClimateComparison(
          weatherData,
          historicalAverage,
          Date.now()
        );
        setClimateComparison(next);
        setClimateLastUpdatedAt(next ? Date.now() : null);
        setClimateStatus(next ? "ready" : "unavailable");
      } catch (climateError) {
        if (
          requestId !== requestIdRef.current ||
          isAbortError(climateError) ||
          !isMountedRef.current
        ) {
          return;
        }

        setClimateComparison(null);
        setClimateLastUpdatedAt(null);
        setClimateStatus("unavailable");
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
        }
      }
    },
    [abortClimateRequest]
  );

  const resetClimateComparison = useCallback(() => {
    abortClimateRequest();
    setClimateComparison(null);
    setClimateLastUpdatedAt(null);
    setClimateStatus(enabledRef.current ? "loading" : "disabled");
  }, [abortClimateRequest]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    // Disabling mid-session must clear the comparison before the next
    // paint — stale data would otherwise stay on screen labeled "Live".
    // The id bump invalidates any in-flight request whose fetch already
    // settled past the abort; the state reset is deferred a microtask
    // to satisfy react-hooks/set-state-in-effect, with the enabledRef
    // recheck guarding against an off→on flip before it runs.
    requestIdRef.current += 1;
    abortClimateRequest();
    Promise.resolve().then(() => {
      if (!enabledRef.current) {
        resetClimateComparison();
      }
    });
  }, [abortClimateRequest, enabled, resetClimateComparison]);

  return {
    climateComparison,
    climateStatus,
    climateLastUpdatedAt,
    requestClimateComparison,
    abortClimateRequest,
    resetClimateComparison,
  };
}
