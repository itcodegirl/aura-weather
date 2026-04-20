import { useCallback, useRef, useEffect } from "react";
import { CloudOff } from "lucide-react";
import "./App.css";
import { useWeather } from "./hooks/useWeather";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { getWeather, gradientCss } from "./utils/weatherCodes";
import HeroCard from "./components/HeroCard";
import RainCard from "./components/RainCard";
import ForecastCard from "./components/ForecastCard";
import NowcastCard from "./components/NowcastCard";
import StormWatch from "./components/StormWatch";
import HourlyCard from "./components/HourlyCard";
import CitySearch from "./components/CitySearch";
import WeatherIcon from "./components/WeatherIcon";

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = (Math.PI / 180) * angle;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function ArcGauge({
  value,
  min = 0,
  max,
  statusColor = "#f97316",
  label,
  decimals = 0,
}) {
  const safe = clamp(value, min, max);
  const span = clamp(max - min, 0.0001, Number.POSITIVE_INFINITY);
  const progress = (safe - min) / span;
  const cx = 58;
  const cy = 60;
  const r = 44;
  const start = -140;
  const end = 100;
  const safeValue = Number.isFinite(value) ? value.toFixed(decimals) : "\u2014";

  return (
    <div className="metric-gauge" aria-label={`${label} ${safeValue}`}>
      <svg className="metric-gauge-svg" viewBox="0 0 116 120" role="img">
        <path
          className="metric-gauge-track"
          d={arcPath(cx, cy, r, start, end)}
        />
        <path
          className="metric-gauge-fill"
          d={arcPath(cx, cy, r, start, start + (end - start) * progress)}
          stroke={statusColor}
        />
      </svg>
      <div className="metric-gauge-value">{safeValue}</div>
    </div>
  );
}

const CARD_STYLE_VARIABLES = [
  { "--i": 0 },
  { "--i": 1 },
  { "--i": 2 },
  { "--i": 3 },
  { "--i": 4 },
  { "--i": 5 },
  { "--i": 6 },
  { "--i": 7 },
  { "--i": 8 },
];

const DEFAULT_UNIT = "F";
const CLIMATE_CONTEXT_DEFAULT = true;

function getAqiStatus(aqi) {
  if (aqi === null || aqi === undefined) {
    return { label: "", color: "rgba(148, 163, 184, 0.92)" };
  }
  if (aqi <= 50) {
    return { label: "Good", color: "#22c55e" };
  }
  if (aqi <= 100) {
    return { label: "Moderate", color: "#eab308" };
  }
  return { label: "Unhealthy", color: "#ef4444" };
}

function getUvStatus(uv) {
  if (uv === null || uv === undefined) {
    return { label: "", color: "rgba(148, 163, 184, 0.92)" };
  }
  if (uv <= 2) {
    return { label: "Low", color: "#22c55e" };
  }
  if (uv <= 5) {
    return { label: "Moderate", color: "#eab308" };
  }
  if (uv <= 7) {
    return { label: "High", color: "#f97316" };
  }
  if (uv <= 10) {
    return { label: "Very High", color: "#f43f5e" };
  }
  return { label: "Extreme", color: "#7f1d1d" };
}

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
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function MetricDensityBar({ value, max, statusColor }) {
  const safeValue = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(Number(value), max))
    : 0;
  const progress = max > 0 ? (safeValue / max) * 100 : 0;

  return (
    <div className="metric-density" aria-label={`${safeValue} of ${max}`}>
      <div className="metric-density-track" aria-hidden="true">
        <span
          className="metric-density-fill"
          style={{ width: `${progress}%`, backgroundColor: statusColor }}
        />
        <span
          className="metric-density-marker"
          style={{
            left: `calc(${progress}% - 5px)`,
            borderColor: statusColor,
          }}
        />
      </div>
      <div className="metric-density-scale">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
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

  const convertTemp = useCallback(
    (value, sourceUnit = weatherDataUnit || "F") => {
      if (!Number.isFinite(Number(value))) return "\u2014";
      const normalizedSource = sourceUnit === "C" ? "C" : "F";

      if (unit === normalizedSource) return Math.round(value);
      if (unit === "F") return Math.round((Number(value) * 9) / 5 + 32);
      return Math.round(((Number(value) - 32) * 5) / 9);
    },
    [unit, weatherDataUnit]
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

  if (loading) {
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
          <p className="loader-text">Fetching atmosphere{"\u2026"}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app app--error">
        <div className="error-card">
          <CloudOff size={42} className="error-card-icon" aria-hidden="true" />
          <h1>Something went sideways</h1>
          <p>{error}</p>
          <button
            type="button"
            className="error-retry"
            onClick={retryWeather}
          >
            Try again
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

          <div className="app-header-actions">
            <CitySearch
              ref={citySearchRef}
              onSelect={(city) => {
                const lat = Number(city?.lat);
                const lon = Number(city?.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                  return;
                }
                loadWeather(lat, lon, city.name, city.country);
              }}
            />
            <button
              type="button"
              className="current-location-btn"
              onClick={() => loadCurrentLocation()}
              disabled={isLocatingCurrent}
              aria-label="Use current location"
            >
              {isLocatingCurrent ? "Locating..." : "Current"}
            </button>
            <div
              className="toggle-pill"
              role="group"
              aria-label="Climate context settings"
            >
              <button
                type="button"
                className={`toggle-pill-btn ${showClimateContext ? "is-active" : ""}`}
                onClick={() => setShowClimateContext(true)}
                aria-pressed={showClimateContext}
                aria-label="Enable climate context"
              >
                On
              </button>
              <button
                type="button"
                className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
                onClick={() => setShowClimateContext(false)}
                aria-pressed={!showClimateContext}
                aria-label="Disable climate context"
              >
                Off
              </button>
            </div>

            <div className="unit-toggle" role="group" aria-label="Temperature unit">
              <button
                onClick={() => setUnit("F")}
                className={`unit-btn ${unit === "F" ? "is-active" : ""}`}
                aria-pressed={unit === "F"}
              >
                {"\u00B0F"}
              </button>
              <button
                onClick={() => setUnit("C")}
                className={`unit-btn ${unit === "C" ? "is-active" : ""}`}
                aria-pressed={unit === "C"}
              >
                {"\u00B0C"}
              </button>
            </div>
          </div>
        </header>

        {locationNotice && (
          <p className="location-notice" role="status" aria-live="polite">
            {locationNotice}
          </p>
        )}

        <main className="bento" id="main-content">
          <HeroCard
            weather={weather}
            location={location}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            convertTemp={convertTemp}
            climateComparison={showClimateContext ? climateComparison : null}
            style={CARD_STYLE_VARIABLES[0]}
          />

          <section
            className="bento-aqi metric-card metric-card--meter"
            style={CARD_STYLE_VARIABLES[1]}
          >
            <span className="metric-label">Air Quality</span>
            <ArcGauge
              value={weather.aqi}
              max={300}
              statusColor={aqiStatus.color}
              decimals={0}
              label="Air quality index"
            />
            {aqiStatus.label && (
              <span className="metric-pill" style={{ "--status-color": aqiStatus.color }}>
                <span className="metric-dot" />
                <span>{aqiStatus.label}</span>
              </span>
            )}
            <MetricDensityBar
              value={weather.aqi}
              max={300}
              statusColor={aqiStatus.color}
            />
          </section>

          <section
            className="bento-uv metric-card metric-card--meter"
            style={CARD_STYLE_VARIABLES[2]}
          >
            <span className="metric-label">UV Index</span>
            <ArcGauge
              value={uvToday}
              max={11}
              statusColor={uvStatus.color}
              decimals={1}
              label="UV index"
            />
            {uvStatus.label && (
              <span className="metric-pill" style={{ "--status-color": uvStatus.color }}>
                <span className="metric-dot" />
                <span>{uvStatus.label}</span>
              </span>
            )}
            <MetricDensityBar
              value={uvToday}
              max={11}
              statusColor={uvStatus.color}
            />
          </section>

          <section className="bento-sunlight metric-card" style={CARD_STYLE_VARIABLES[3]}>
            <span className="metric-label">Sunlight</span>
            <div className="metric-sunline">{`Sunrise ${sunriseLabel} \u2192 Sunset ${sunsetLabel}`}</div>
            {dayLengthLabel ? (
              <div className="metric-sun-length">Daylight {dayLengthLabel}</div>
            ) : null}
          </section>

          <RainCard
            weather={weather}
            unit={unit}
            dataUnit={weatherDataUnit}
            style={CARD_STYLE_VARIABLES[4]}
          />
          <NowcastCard weather={weather} style={CARD_STYLE_VARIABLES[5]} />
          <HourlyCard
            weather={weather}
            unit={unit}
            convertTemp={convertTemp}
            chartTopColor={weatherInfo?.gradient?.[0]}
            chartBottomColor={weatherInfo?.gradient?.[2] ?? weatherInfo?.gradient?.[1]}
            style={CARD_STYLE_VARIABLES[6]}
          />
          <StormWatch
            weather={weather}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            convertTemp={convertTemp}
            style={CARD_STYLE_VARIABLES[7]}
          />
          <ForecastCard
            weather={weather}
            unit={unit}
            convertTemp={convertTemp}
            style={CARD_STYLE_VARIABLES[8]}
          />
        </main>
      </div>
    </div>
  );
}

export default App;

