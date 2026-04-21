import { useRef, useEffect, lazy, Suspense } from "react";
import { CloudOff } from "lucide-react";
import "./App.css";
import { useWeather } from "./hooks/useWeather";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { getWeather, gradientCss } from "./utils/weatherCodes";
import { getAqiStatus, getUvStatus } from "./utils/weatherSignals";
import HeroCard from "./components/HeroCard";
import RainCard from "./components/RainCard";
import ForecastCard from "./components/ForecastCard";
import NowcastCard from "./components/NowcastCard";
import HeaderControls from "./components/HeaderControls";
import WeatherIcon from "./components/WeatherIcon";
import ExposureMetricCard from "./components/ExposureMetricCard";

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

function formatClock(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";

  const now = Date.now();
  if (date.getTime() > now + 24 * 60 * 60 * 1000 * 10) {
    return "\u2014";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDayLengthMinutes(sunrise, sunset) {
  if (!sunrise || !sunset) return null;
  const sunriseDate = new Date(sunrise);
  const sunsetDate = new Date(sunset);
  if (Number.isNaN(sunriseDate.getTime()) || Number.isNaN(sunsetDate.getTime())) {
    return null;
  }
  let diffMs = sunsetDate.getTime() - sunriseDate.getTime();
  if (diffMs <= 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  return Math.max(0, Math.round(diffMs / 60000));
}

function formatDayLength(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}

const CLIMATE_CONTEXT_KEY = "aura-weather-climate-context";
const UNIT_PREFERENCE_KEY = "aura-weather-unit-preference";
const GROUP_LABEL_IDS = {
  currentConditions: "group-current-conditions",
  nearTermOutlook: "group-near-term-outlook",
  riskSignals: "group-risk-signals",
  weekAhead: "group-week-ahead",
};

const METRIC_LABEL_IDS = {
  exposure: "metric-exposure",
  airQuality: "metric-air-quality",
  uvIndex: "metric-uv-index",
  sunlight: "metric-sunlight",
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
    return (
      <div className="app app--loading">
        <div
          className="loader"
          role="status"
          aria-live="polite"
          aria-label="Loading weather data"
        >
          <WeatherIcon
            code={0}
            size={80}
            animated={false}
            className="loader-weather-icon"
          />
          <p className="loader-text">Loading live conditions{"\u2026"}</p>
        </div>
      </div>
    );
  }

  if (showGlobalError) {
    return (
      <div className="app app--error">
        <div className="error-card">
          <CloudOff size={42} className="error-card-icon" aria-hidden="true" />
          <h1>We couldn't load weather data</h1>
          <p>{error}</p>
          <button
            type="button"
            className="error-retry"
            onClick={retryWeather}
          >
            Reload weather
          </button>
        </div>
      </div>
    );
  }

  const weatherInfo = getWeather(weather.current.weather_code);
  const background = gradientCss(weatherInfo.gradient);
  const uvToday = weather.daily?.uv_index_max?.[0];
  const aqiStatus = getAqiStatus(weather.aqi);
  const uvStatus = getUvStatus(uvToday);
  const sunrise = weather.daily?.sunrise?.[0];
  const sunset = weather.daily?.sunset?.[0];
  const sunriseLabel = formatClock(sunrise);
  const sunsetLabel = formatClock(sunset);
  const dayLengthMinutes = getDayLengthMinutes(sunrise, sunset);
  const dayLengthLabel = formatDayLength(dayLengthMinutes);
  const aqiSupportText = Number.isFinite(Number(weather.aqi))
    ? `Current AQI is ${Math.round(Number(weather.aqi))} out of 300.`
    : "Air quality data is temporarily unavailable.";
  const uvSupportText = Number.isFinite(Number(uvToday))
    ? `Peak UV is ${Number(uvToday).toFixed(1)} on an 11+ scale.`
    : "UV data is temporarily unavailable.";

  return (
    <div className="app" style={{ background }}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="ambient-blob ambient-blob--tl" />
      <div className="ambient-blob ambient-blob--br" />

      <div className="app-inner">
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

          <section
            className="bento-exposure exposure-card metric-card"
            style={CARD_STYLE_VARIABLES[1]}
            aria-labelledby={METRIC_LABEL_IDS.exposure}
          >
            <div className="metric-head">
              <h2 id={METRIC_LABEL_IDS.exposure} className="metric-label">
                Environmental Exposure
              </h2>
              <span className="metric-context">Live</span>
            </div>

            <div className="exposure-grid">
              <ExposureMetricCard
                id={METRIC_LABEL_IDS.airQuality}
                title="Air Quality"
                context="AQI"
                value={weather.aqi}
                max={300}
                status={aqiStatus}
                gaugeLabel="Air quality index"
                supportText={aqiSupportText}
              />
              <ExposureMetricCard
                id={METRIC_LABEL_IDS.uvIndex}
                title="UV Index"
                context="Today"
                value={uvToday}
                max={11}
                status={uvStatus}
                gaugeLabel="UV index"
                decimals={1}
                supportText={uvSupportText}
              />
            </div>
          </section>

          <section
            className="bento-sunlight metric-card"
            style={CARD_STYLE_VARIABLES[2]}
            aria-labelledby={METRIC_LABEL_IDS.sunlight}
          >
            <div className="metric-head">
              <h2 id={METRIC_LABEL_IDS.sunlight} className="metric-label">
                Sunlight
              </h2>
              <span className="metric-context">Local</span>
            </div>
            <div className="sun-times" aria-label="Sunrise and sunset times">
              <div className="sun-time-chip">
                <span className="sun-time-label">Sunrise</span>
                <span className="sun-time-value">{sunriseLabel}</span>
              </div>
              <div className="sun-time-chip">
                <span className="sun-time-label">Sunset</span>
                <span className="sun-time-value">{sunsetLabel}</span>
              </div>
            </div>
            {dayLengthLabel ? (
              <div className="metric-sun-length">Daylight {dayLengthLabel}</div>
            ) : (
              <p className="metric-support">Daylight duration is unavailable.</p>
            )}
          </section>

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
      </div>
    </div>
  );
}

export default App;
