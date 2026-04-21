import { useRef, useEffect, lazy, Suspense } from "react";
import "./App.css";
import { useWeather } from "./hooks/useWeather";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { getWeather, gradientCss } from "./domain/weatherCodes";
import HeroCard from "./components/HeroCard";
import RainCard from "./components/RainCard";
import ForecastCard from "./components/ForecastCard";
import NowcastCard from "./components/NowcastCard";
import ExposureSection from "./components/ExposureSection";
import SunlightSection from "./components/SunlightSection";
import HeaderControls from "./components/HeaderControls";
import { AppShell, AppLoadingState, AppErrorState } from "./components/layout";

const loadStormWatch = () => import("./components/StormWatch");
const loadHourlyCard = () => import("./components/HourlyCard");
const StormWatch = lazy(loadStormWatch);
const HourlyCard = lazy(loadHourlyCard);

const CARD_STYLE_VARIABLES = [
  { "--i": 0 },
  { "--i": 1 },
  { "--i": 2 },
  { "--i": 3 },
  { "--i": 4 },
  { "--i": 5 },
  { "--i": 6 },
  { "--i": 7 },
];

const GROUP_LABEL_STYLE_VARIABLES = [
  { "--group-i": 0 },
  { "--group-i": 1 },
  { "--group-i": 2 },
  { "--group-i": 3 },
];

function CardFallback({ className, style, title }) {
  return (
    <section className={`${className} loading-card`} style={style}>
      <p className="loading-card-title" role="status" aria-live="polite">
        {title}
      </p>
    </section>
  );
}

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
const GROUP_LABEL_IDS = {
  currentConditions: "group-current-conditions",
  nearTermOutlook: "group-near-term-outlook",
  riskSignals: "group-risk-signals",
  weekAhead: "group-week-ahead",
};

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
  const hasStatusStack = Boolean(
    locationNotice || isBackgroundLoading || showRefreshError
  );

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

      {hasStatusStack ? (
        <div className="status-stack">
          {locationNotice && (
            <p className="location-notice" role="status" aria-live="polite">
              {locationNotice}
            </p>
          )}
          {isBackgroundLoading && (
            <p className="app-status app-status--loading" role="status" aria-live="polite">
              Updating weather for your current settings...
            </p>
          )}
          {showRefreshError && (
            <p className="app-status app-status--error" role="alert">
              Could not refresh weather right now. Showing last known data.
              <button
                type="button"
                className="app-status-retry"
                onClick={retryWeather}
              >
                Retry
              </button>
            </p>
          )}
        </div>
      ) : null}

      <main
        className="bento"
        id="main-content"
        aria-busy={isBackgroundLoading}
        tabIndex={-1}
      >
          <p
            id={GROUP_LABEL_IDS.currentConditions}
            className="bento-group-label"
            style={GROUP_LABEL_STYLE_VARIABLES[0]}
          >
            Current Conditions
          </p>
          <HeroCard
            weather={weather}
            location={location}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            weatherWindSpeedUnit={weatherWindSpeedUnit}
            climateComparison={showClimateContext ? climateComparison : null}
            style={CARD_STYLE_VARIABLES[0]}
          />

          <ExposureSection
            aqi={weather.aqi}
            uvIndex={weather.daily?.uvIndexMax?.[0]}
            style={CARD_STYLE_VARIABLES[1]}
          />

          <SunlightSection
            sunrise={weather.daily?.sunrise?.[0]}
            sunset={weather.daily?.sunset?.[0]}
            style={CARD_STYLE_VARIABLES[2]}
          />

          <p
            id={GROUP_LABEL_IDS.nearTermOutlook}
            className="bento-group-label"
            style={GROUP_LABEL_STYLE_VARIABLES[1]}
          >
            Near-Term Outlook
          </p>
          <RainCard
            weather={weather}
            unit={unit}
            dataUnit={weatherDataUnit}
            style={CARD_STYLE_VARIABLES[3]}
          />
          <NowcastCard weather={weather} style={CARD_STYLE_VARIABLES[4]} />
          <Suspense
            fallback={
              <CardFallback
                className="bento-chart"
                style={CARD_STYLE_VARIABLES[5]}
                title="Loading hourly outlook..."
              />
            }
          >
            <HourlyCard
              weather={weather}
              unit={unit}
              weatherDataUnit={weatherDataUnit}
              chartTopColor={weatherInfo?.gradient?.[0]}
              chartBottomColor={weatherInfo?.gradient?.[2] ?? weatherInfo?.gradient?.[1]}
              style={CARD_STYLE_VARIABLES[5]}
            />
          </Suspense>
          <p
            id={GROUP_LABEL_IDS.riskSignals}
            className="bento-group-label"
            style={GROUP_LABEL_STYLE_VARIABLES[2]}
          >
            Risk Signals
          </p>
          <Suspense
            fallback={
              <CardFallback
                className="bento-storm"
                style={CARD_STYLE_VARIABLES[6]}
                title="Loading risk signals..."
              />
            }
          >
            <StormWatch
              weather={weather}
              unit={unit}
              weatherDataUnit={weatherDataUnit}
              weatherWindSpeedUnit={weatherWindSpeedUnit}
              style={CARD_STYLE_VARIABLES[6]}
            />
          </Suspense>
          <p
            id={GROUP_LABEL_IDS.weekAhead}
            className="bento-group-label"
            style={GROUP_LABEL_STYLE_VARIABLES[3]}
          >
            Week Ahead
          </p>
          <ForecastCard
            weather={weather}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            style={CARD_STYLE_VARIABLES[7]}
          />
      </main>
    </AppShell>
  );
}

export default App;
