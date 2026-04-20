import { useState, useCallback } from "react";
import "./App.css";
import { useWeather } from "./hooks/useWeather";
import { getWeather, gradientCss } from "./utils/weatherCodes";
import HeroCard from "./components/HeroCard";
import RainCard from "./components/RainCard";
import ForecastCard from "./components/ForecastCard";
import StormWatch from "./components/StormWatch";
import HourlyCard from "./components/HourlyCard";
import CitySearch from "./components/CitySearch";

function App() {
  const [unit, setUnit] = useState("F");
  const {
    weather,
    location,
    loading,
    error,
    locationNotice,
    loadWeather,
    retryWeather,
  } = useWeather(unit);

  const convertTemp = useCallback(
    (f) => (unit === "F" ? Math.round(f) : Math.round(((f - 32) * 5) / 9)),
    [unit]
  );

  const getAqiStatus = (aqi) => {
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
  };

  const getUvStatus = (uv) => {
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
  };

  if (loading) {
    return (
      <div className="app app--loading">
        <div
          className="loader"
          role="status"
          aria-live="polite"
          aria-label="Loading weather data"
        >
          <div className="loader-spinner" />
          <p className="loader-text">Fetching atmosphere{"\u2026"}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app app--error">
        <div className="error-card">
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

  return (
    <div className="app" style={{ background }}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="ambient-blob ambient-blob--tl" />
      <div className="ambient-blob ambient-blob--br" />

      <div className="app-inner">
        <header className="app-header">
          <div>
            <h1 className="brand">Aura</h1>
            <p className="tagline">Atmospheric Intelligence</p>
          </div>

          <div className="app-header-actions">
            <CitySearch
              onSelect={(city) =>
                loadWeather(city.lat, city.lon, city.name, city.country)
              }
            />

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
            convertTemp={convertTemp}
          />

          <section className="bento-aqi metric-card">
            <span className="metric-label">Air Quality</span>
            <span className="metric-value">
              {weather.aqi != null ? weather.aqi : "\u2014"}
            </span>
            {aqiStatus.label && (
              <span className="metric-pill" style={{ "--status-color": aqiStatus.color }}>
                <span className="metric-dot" />
                <span>{aqiStatus.label}</span>
              </span>
            )}
          </section>

          <section className="bento-uv metric-card">
            <span className="metric-label">UV Index</span>
            <span className="metric-value">
              {uvToday != null ? uvToday.toFixed(1) : "\u2014"}
            </span>
            {uvStatus.label && (
              <span className="metric-pill" style={{ "--status-color": uvStatus.color }}>
                <span className="metric-dot" />
                <span>{uvStatus.label}</span>
              </span>
            )}
          </section>

          <RainCard weather={weather} />
          <HourlyCard weather={weather} unit={unit} convertTemp={convertTemp} />
          <StormWatch
            weather={weather}
            unit={unit}
            convertTemp={convertTemp}
          />
          <ForecastCard
            weather={weather}
            unit={unit}
            convertTemp={convertTemp}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
