import { useMemo, useRef } from "react";
import { deriveWeatherScene } from "../domain/weatherScene";
import { useSearchShortcut } from "./useAppShellEffects";
import { useDisplayPreferences } from "./useDisplayPreferences";
import { useWeather } from "./useWeather";

export function useWeatherDashboardViewModel() {
  const { unit, setUnit, showClimateContext, setShowClimateContext } =
    useDisplayPreferences();
  const citySearchRef = useRef(null);

  const weatherState = useWeather(unit, { climateEnabled: showClimateContext });
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
