// src/components/HeroCard.jsx

import { memo } from "react";
import { MapPin, Wind, Droplets, Gauge, Thermometer, Sun } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { formatWindSpeed } from "../utils/windUnits";
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

function formatClock(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function daylightLabel(start, end) {
  if (!start || !end) return "Day length: —";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Day length: —";
  }

  let diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) diffMs += 24 * 60 * 60 * 1000;
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `Day length: ${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function HeroCard({ weather, location, unit, convertTemp, style }) {
  const current = weather.current;
  const info = getWeather(current.weather_code);
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const windDisplay = formatWindSpeed(current.wind_speed_10m, unit);
  const dewPoint = convertTemp(current.dew_point_2m);

  const sunrise = weather.daily?.sunrise?.[0];
  const sunset = weather.daily?.sunset?.[0];
  const sunriseText = formatClock(sunrise);
  const sunsetText = formatClock(sunset);
  const dayLength = daylightLabel(sunrise, sunset);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="bento-hero hero-card" style={style}>
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
          value={windDisplay}
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
          icon={<Thermometer size={18} />}
          label="Dew Point"
          value={`${dewPoint}${tempUnit}`}
        />
        {sunrise && sunset ? (
          <div className="hero-stat hero-stat-solar">
            <div className="stat-icon">
              <Sun size={18} />
            </div>
            <div className="hero-stat-body">
              <div className="stat-label">Sunlight</div>
              <div className="hero-sun-times">{`Sunrise ${sunriseText} → Sunset ${sunsetText}`}</div>
              <div className="hero-sun-length">{dayLength}</div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default memo(HeroCard);
