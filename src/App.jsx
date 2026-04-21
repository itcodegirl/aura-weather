import { useRef, useEffect, lazy } from "react";
import "./App.css";
import { useWeather } from "./hooks/useWeather";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { getWeather, gradientCss } from "./domain/weatherCodes";
import HeaderControls from "./components/HeaderControls";
import {
  AppShell,
  AppLoadingState,
  AppErrorState,
  StatusStack,
  WeatherDashboard,
} from "./components/layout";

const loadStormWatch = () => import("./components/StormWatch");
const loadHourlyCard = () => import("./components/HourlyCard");
const StormWatch = lazy(loadStormWatch);
const HourlyCard = lazy(loadHourlyCard);

const DEFAULT_UNIT = "F";
const CLIMATE_CONTEXT_DEFAULT = true;

function deserializeUnitPreference(storedUnit) {
  return storedUnit === "F" || storedUnit === "C" ? storedUnit : DEFAULT_UNIT;
}

function deserializeClimatePreference(storedValue) {
  if (storedValue === "off") return false;
  if (storedValue === "on") return true;
  return CLIMATE_CONTEXT_DEFAULT;
}

function serializeClimatePreference(showClimateContext) {
  return showClimateContext ? "on" : "off";
}

const CLIMATE_CONTEXT_KEY = "aura-weather-climate-context";
const UNIT_PREFERENCE_KEY = "aura-weather-unit-preference";
function App() {
  const [unit, setUnit] = useLocalStorageState(
    UNIT_PREFERENCE_KEY,
    DEFAULT_UNIT,
    {
      deserialize: deserializeUnitPreference,
    }
  );
  const [showClimateContext, setShowClimateContext] = useLocalStorageState(
    CLIMATE_CONTEXT_KEY,
    CLIMATE_CONTEXT_DEFAULT,
    {
      deserialize: deserializeClimatePreference,
      serialize: serializeClimatePreference,
    }
  );
  const citySearchRef = useRef(null);
  const {
    weather,
    weatherDataUnit,
    weatherWindSpeedUnit,
    location,
    loading,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
    retryWeather,
    climateComparison,
    isLocatingCurrent,
  } = useWeather(unit, { climateEnabled: showClimateContext });

  const hasWeatherData = Boolean(weather);
  const showGlobalLoading = loading && !hasWeatherData;
  const isBackgroundLoading = loading && hasWeatherData;
  const showGlobalError = Boolean(error) && !hasWeatherData;
  const showRefreshError = Boolean(error) && hasWeatherData;

  useEffect(() => {
    const handleShortcut = (event) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      if (!isMetaOrCtrl || event.key.toLowerCase() !== "k") return;

      const activeElement = event.target;
      const isTypingTarget =
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable ||
          activeElement.tagName === "SELECT");

      if (isTypingTarget) return;

      event.preventDefault();
      citySearchRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);

    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;
    let idleId;
    let timeoutId;

    const preloadHeavyPanels = () => {
      if (cancelled) return;
      void loadHourlyCard();
      void loadStormWatch();
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(preloadHeavyPanels, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(preloadHeavyPanels, 1200);
    }

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && idleId !== undefined) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (showGlobalLoading) {
    return <AppLoadingState />;
  }

  if (showGlobalError) {
    return <AppErrorState error={error} onRetry={retryWeather} />;
  }

  const weatherInfo = getWeather(weather.current.conditionCode);
  const background = gradientCss(weatherInfo.gradient);

  return (
    <AppShell background={background}>
      <header className="app-header">
        <div className="brand-wrap">
          <img
            src="/atmosphere-ring.svg"
            alt="Atmospheric icon"
            className="brand-mark"
            width="28"
            height="28"
            loading="lazy"
          />
          <h1 className="brand">Aura</h1>
          <p className="tagline">Atmospheric Intelligence</p>
        </div>
        <HeaderControls
          citySearchRef={citySearchRef}
          loadWeather={loadWeather}
          loadCurrentLocation={loadCurrentLocation}
          isLocatingCurrent={isLocatingCurrent}
          showClimateContext={showClimateContext}
          setShowClimateContext={setShowClimateContext}
          unit={unit}
          setUnit={setUnit}
        />
      </header>

      <StatusStack
        locationNotice={locationNotice}
        isBackgroundLoading={isBackgroundLoading}
        showRefreshError={showRefreshError}
        onRetry={retryWeather}
      />

      <WeatherDashboard
        weather={weather}
        location={location}
        unit={unit}
        weatherDataUnit={weatherDataUnit}
        weatherWindSpeedUnit={weatherWindSpeedUnit}
        climateComparison={climateComparison}
        showClimateContext={showClimateContext}
        isBackgroundLoading={isBackgroundLoading}
        weatherInfo={weatherInfo}
        HourlyCardComponent={HourlyCard}
        StormWatchComponent={StormWatch}
      />
    </AppShell>
  );
}

export default App;
