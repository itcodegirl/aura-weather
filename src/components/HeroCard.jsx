// src/components/HeroCard.jsx

import { MapPin, Wind, Droplets, Gauge, Eye } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import WeatherIcon from "./WeatherIcon";
import "./HeroCard.css";

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

export default function HeroCard({ weather, location, unit, convertTemp }) {
  const current = weather.current;
  const info = getWeather(current.weather_code);
  const tempUnit = unit === "F" ? "°F" : "°C";
  const windSpeed =
    unit === "F"
      ? Math.round(current.wind_speed_10m)
      : Math.round(current.wind_speed_10m * 1.60934);
  const windUnit = unit === "F" ? "mph" : "km/h";
  const visibilityMiles = current.visibility / 1609.34;
  const visibilityLabel =
    visibilityMiles >= 10
      ? `${Math.round(visibilityMiles)} mi`
      : `${visibilityMiles.toFixed(1)} mi`;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="bento-hero hero-card">
      <header className="hero-meta">
        <div className="hero-location">
          <MapPin size={14} />
          <span>
            {location.name}
            {location.country ? `, ${location.country}` : ""}
          </span>
        </div>
        <p className="hero-date">{today}</p>
      </header>

      <div className="hero-main">
        <div className="hero-icon">
          <WeatherIcon code={current.weather_code} size={120} animated />
        </div>
        <div className="hero-temp-block">
          <div className="hero-temp">
            {convertTemp(current.temperature_2m)}
            <span className="hero-temp-unit">{tempUnit}</span>
          </div>
          <div className="hero-condition">{info.label}</div>
          <div className="hero-feels">
            Feels like {convertTemp(current.apparent_temperature)}
            {tempUnit}
          </div>
        </div>
      </div>

      <div className="hero-stats">
        <Stat
          icon={<Wind size={18} />}
          label="Wind"
          value={`${windSpeed} ${windUnit}`}
        />
        <Stat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={`${Math.round(current.relative_humidity_2m)}%`}
        />
        <Stat
          icon={<Gauge size={18} />}
          label="Pressure"
          value={`${Math.round(current.surface_pressure)} hPa`}
        />
        <Stat
          icon={<Eye size={18} />}
          label="Visibility"
          value={visibilityLabel}
        />
      </div>
    </section>
  );
}
