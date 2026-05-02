import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistoricalTemperatureAverage } from "../api";
import { buildClimateComparison } from "./climateComparison";

const DEFAULT_API_TEMPERATURE_UNIT = "fahrenheit";

function isAbortError(error) {
  return error?.name === "AbortError";
}

/**
 * Owns the historical-archive request lifecycle and exposes
 * comparison + status state. Consumers call requestClimateComparison
 * whenever a fresh forecast lands.
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

        const next = buildClimateComparison(weatherData, historicalAverage);
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

  return {
    climateComparison,
    climateStatus,
    climateLastUpdatedAt,
    requestClimateComparison,
    abortClimateRequest,
    resetClimateComparison,
  };
}
