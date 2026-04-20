// src/components/ForecastCard.jsx

import { memo } from "react";
import { CalendarDays, Droplets } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { formatDayLabel, parseLocalDate } from "../utils/dates";
import WeatherIcon from "./WeatherIcon";
import "./ForecastCard.css";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = NaN) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function DayRow({ day, weekMin, weekMax, convertTemp, rangeGradient }) {
  const info = getWeather(day.weather_code);
  const label = formatDayLabel(day.date);
  const high = Number.isFinite(day.temp_max) ? convertTemp(day.temp_max) : "\u2014";
  const low = Number.isFinite(day.temp_min) ? convertTemp(day.temp_min) : "\u2014";
  const tempUnit = "\u00B0";

  const weekRange = weekMax - weekMin || 1;
  const startPct = Number.isFinite(day.temp_min)
    ? clamp(((day.temp_min - weekMin) / weekRange) * 100, 0, 100)
    : 0;
  const endPct = Number.isFinite(day.temp_max)
    ? clamp(((day.temp_max - weekMin) / weekRange) * 100, 0, 100)
    : 0;

  return (
    <li className="forecast-row" role="listitem">
      <div className="forecast-day">{label}</div>

      <div className="forecast-icon" aria-label={info.label}>
        <WeatherIcon code={day.weather_code} size={22} />
      </div>

      <div className="forecast-precip">
        {day.precipitation_probability_max >= 20 ? (
          <>
            <Droplets size={11} />
            <span>{day.precipitation_probability_max}%</span>
          </>
        ) : (
          <span className="forecast-precip-empty">{`\u2014`}</span>
        )}
      </div>

      <div className="forecast-low">
        {low}
        {tempUnit}
      </div>

      <div className="forecast-range">
        <div
          className="forecast-range-bar"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(endPct - startPct, 3)}%`,
            background: rangeGradient,
          }}
        />
      </div>

      <div className="forecast-high">
        {high}
        {tempUnit}
      </div>
    </li>
  );
}

function ForecastCard({ weather, convertTemp, style }) {
  const daily = weather?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const weatherCodes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const maxTemps = Array.isArray(daily.temperature_2m_max)
    ? daily.temperature_2m_max
    : [];
  const minTemps = Array.isArray(daily.temperature_2m_min)
    ? daily.temperature_2m_min
    : [];
  const precipProbabilities = Array.isArray(daily.precipitation_probability_max)
    ? daily.precipitation_probability_max
    : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = times
    .map((date, index) => ({
      date,
      weather_code: toFiniteNumber(weatherCodes[index], 0) || 0,
      temp_max: toFiniteNumber(maxTemps[index]),
      temp_min: toFiniteNumber(minTemps[index]),
      precipitation_probability_max: clampPercent(
        toFiniteNumber(precipProbabilities[index], 0)
      ),
    }))
    .filter((day) => Number.isFinite(day.temp_max) || Number.isFinite(day.temp_min))
    .filter((day) => {
      const dayDate = parseLocalDate(day.date);
      if (Number.isNaN(dayDate.getTime())) return false;
      dayDate.setHours(0, 0, 0, 0);
      return dayDate >= today;
    })
    .slice(0, 7);

  if (!days.length) {
    return (
      <section className="bento-forecast forecast-card" style={style}>
        <header className="forecast-header">
          <div className="forecast-title">
            <CalendarDays size={16} />
            <span>7-Day Forecast</span>
          </div>
          <span className="forecast-subtitle">Week ahead</span>
        </header>
        <p className="loader-text" role="status" aria-live="polite">
          Forecast data unavailable.
        </p>
      </section>
    );
  }

  const validWeekMins = days.map((day) => day.temp_min).filter((value) => Number.isFinite(value));
  const validWeekMaxs = days.map((day) => day.temp_max).filter((value) => Number.isFinite(value));
  const weekMin = validWeekMins.length ? Math.min(...validWeekMins) : 0;
  const weekMax = validWeekMaxs.length ? Math.max(...validWeekMaxs) : weekMin;
  const rangeGradientStart = weekMin <= 40 ? "#60a5fa" : "#f59e0b";
  const rangeGradientEnd =
    weekMax >= 95 ? "#ef4444" : weekMax >= 82 ? "#f97316" : "#fbbf24";
  const rangeGradient = `linear-gradient(to right, ${rangeGradientStart}, ${rangeGradientEnd})`;

  return (
    <section className="bento-forecast forecast-card" style={style}>
      <header className="forecast-header">
        <div className="forecast-title">
          <CalendarDays size={16} />
          <span>7-Day Forecast</span>
        </div>
        <span className="forecast-subtitle">Week ahead</span>
      </header>

      <ul className="forecast-list" role="list">
        {days.map((day) => (
          <DayRow
            key={day.date}
            day={day}
            weekMin={weekMin}
            weekMax={weekMax}
            convertTemp={convertTemp}
            rangeGradient={rangeGradient}
          />
        ))}
      </ul>
    </section>
  );
}

export default memo(ForecastCard);
