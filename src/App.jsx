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
  const { weather, location, loading, error, loadWeather} = useWeather();
  const [unit, setUnit] = useState("F");

  const convertTemp = useCallback(
    (f) => (unit === "F" ? Math.round(f) : Math.round(((f - 32) * 5) / 9)),
    [unit]
  );

  if (loading) {
    return (
      <div className="app app--loading">
        <div className="loader">
          <div className="loader-spinner" />
          <p className="loader-text">Fetching atmosphere…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app app--error">
        <div className="error-card">
          <h2>Something went sideways</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const weatherInfo = getWeather(weather.current.weather_code);
  const background = gradientCss(weatherInfo.gradient);

  const uvToday = weather.daily.uv_index_max[0];

  return (
    <div className="app" style={{ background }}>
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
              °F
            </button>
              <button
                onClick={() => setUnit("C")}
                className={`unit-btn ${unit === "C" ? "is-active" : ""}`}
                aria-pressed={unit === "C"}
              >
                °C
              </button>
            </div>
          </div>
        </header>

        <main className="bento">
          <HeroCard
            weather={weather}
            location={location}
            unit={unit}
            convertTemp={convertTemp}
          />

          <section className="bento-aqi placeholder">
            <span className="placeholder-label">Air Quality</span>
            <span className="placeholder-value">
              {weather.aqi != null ? weather.aqi : "—"}
            </span>
          </section>

          <section className="bento-uv placeholder">
            <span className="placeholder-label">UV Index</span>
            <span className="placeholder-value">
              {uvToday != null ? uvToday.toFixed(1) : "—"}
            </span>
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