import { useMemo, useRef } from "react";
import { deriveWeatherScene } from "../domain/weatherScene";
import {
  buildMissingDashboardState,
  isMissingMockEnabled,
} from "../mocks/missingData";
import { useSearchShortcut } from "./useAppShellEffects";
import { useDisplayPreferences } from "./useDisplayPreferences";
import { usePrefersReducedData } from "./usePrefersReducedData";
import { useWeather } from "./useWeather";

const NOOP = () => {};

function getInitialMissingMock() {
  if (typeof window === "undefined") {
    return false;
  }
  return isMissingMockEnabled(window.location?.search ?? "");
}

function buildMissingMockViewModel() {
  const baseState = buildMissingDashboardState();
  return {
    ...baseState,
    loadWeather: NOOP,
    loadCurrentLocation: NOOP,
    clearSavedLocation: NOOP,
    savedCities: [],
    recentCities: [],
    startupLocation: null,
    loadSavedCity: NOOP,
    setStartupCity: NOOP,
    restoreSavedCity: NOOP,
    forgetSavedCity: NOOP,
    moveSavedCity: NOOP,
    syncConnected: false,
    syncAccount: null,
    syncState: null,
    createSyncAccount: NOOP,
    connectSyncAccount: NOOP,
    disconnectSyncAccount: NOOP,
    syncSavedCitiesNow: NOOP,
    retryWeather: NOOP,
  };
}

export function useWeatherDashboardViewModel() {
  const { unit, setUnit, showClimateContext, setShowClimateContext } =
    useDisplayPreferences();
  const prefersReducedData = usePrefersReducedData();
  const citySearchRef = useRef(null);
  const isMissingMock = useMemo(() => getInitialMissingMock(), []);

  // Honor the OS-level "reduce data" preference by suppressing the
  // historical-archive fetch even when the user has climate context
  // enabled. The toggle stays user-settable; this only narrows the
  // network request. Also suppress when the missing-data mock is active
  // since that state doesn't need a live archive fetch.
  const climateEnabled = showClimateContext && !prefersReducedData && !isMissingMock;

  const weatherState = useWeather({
    climateEnabled,
    weatherEnabled: !isMissingMock,
    // The visible-tab refresh cadence is background spend; reduced-data
    // users keep the event-driven refresh triggers (tab return,
    // reconnect) but skip the standing poll.
    backgroundRefreshEnabled: !prefersReducedData,
  });
  const mockState = useMemo(
    () => (isMissingMock ? buildMissingMockViewModel() : null),
    [isMissingMock]
  );
  const effectiveState = mockState ?? weatherState;
  const scene = useMemo(
    () =>
      deriveWeatherScene({
        weather: effectiveState.weather,
        loading: effectiveState.loading,
        error: effectiveState.error,
      }),
    [effectiveState.weather, effectiveState.loading, effectiveState.error]
  );

  useSearchShortcut(citySearchRef);

  return {
    ...effectiveState,
    ...scene,
    citySearchRef,
    prefersReducedData,
    unit,
    setUnit,
    showClimateContext,
    setShowClimateContext,
  };
}
