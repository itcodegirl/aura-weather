import { useMemo, useRef } from "react";
import { deriveWeatherScene } from "../domain/weatherScene";
import { useSearchShortcut } from "./useAppShellEffects";
import { useDisplayPreferences } from "./useDisplayPreferences";
import { usePrefersReducedData } from "./usePrefersReducedData";
import { useWeather } from "./useWeather";

export function useWeatherDashboardViewModel() {
  const { unit, setUnit, showClimateContext, setShowClimateContext } =
    useDisplayPreferences();
  const prefersReducedData = usePrefersReducedData();
  const citySearchRef = useRef(null);

  // Honor the OS-level "reduce data" preference by suppressing the
  // historical-archive fetch even when the user has climate context
  // enabled. The toggle stays user-settable; this only narrows the
  // network request.
  const climateEnabled = showClimateContext && !prefersReducedData;

  const weatherState = useWeather({ climateEnabled });
  const scene = useMemo(
    () =>
      deriveWeatherScene({
        weather: weatherState.weather,
        loading: weatherState.loading,
        error: weatherState.error,
      }),
    [weatherState.weather, weatherState.loading, weatherState.error]
  );

  useSearchShortcut(citySearchRef);

  return {
    ...weatherState,
    ...scene,
    citySearchRef,
    unit,
    setUnit,
    showClimateContext,
    setShowClimateContext,
  };
}
