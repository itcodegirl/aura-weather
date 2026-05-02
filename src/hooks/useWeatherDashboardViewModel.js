import { useMemo, useRef } from "react";
import { deriveWeatherScene } from "../domain/weatherScene";
import {
  buildMissingDashboardState,
  isMissingMockEnabled,
} from "../mocks/missingData";
import { useSearchShortcut } from "./useAppShellEffects";
import { useDisplayPreferences } from "./useDisplayPreferences";
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
    loadSavedCity: NOOP,
    forgetSavedCity: NOOP,
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
  const citySearchRef = useRef(null);
  const isMissingMock = useMemo(() => getInitialMissingMock(), []);

  const weatherState = useWeather({
    climateEnabled: showClimateContext && !isMissingMock,
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
    unit,
    setUnit,
    showClimateContext,
    setShowClimateContext,
  };
}
