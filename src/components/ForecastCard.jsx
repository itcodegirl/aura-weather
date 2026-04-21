// src/components/ForecastCard.jsx

import { CalendarDays, Droplets } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { formatDayLabel, parseLocalDate } from "../utils/dates";
import { convertTemperature } from "../utils/weatherUnits";
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

function getDaySignal(day, weekMin, weekMax) {
  const rainChance = day.rainChanceMax;
  if (rainChance >= 60) {
    return { label: "Rain Watch", tone: "wet" };
  }
  if (Number.isFinite(day.temperatureMax) && day.temperatureMax >= weekMax - 1) {
    return { label: "Warm Peak", tone: "warm" };
  }
  if (Number.isFinite(day.temperatureMin) && day.temperatureMin <= weekMin + 1) {
    return { label: "Cool Dip", tone: "cool" };
  }
  return { label: "Steady", tone: "steady" };
}

function toDisplayTemp(value, unit, weatherDataUnit) {
  const converted = convertTemperature(value, unit, weatherDataUnit);
  return Number.isFinite(converted) ? Math.round(converted) : "\u2014";
}

function buildWeekSummary(days, weekMin, weekMax, unit, weatherDataUnit) {
  const firstMax = days[0]?.temperatureMax;
  const lastMax = days[days.length - 1]?.temperatureMax;
  const delta =
    Number.isFinite(firstMax) && Number.isFinite(lastMax) ? lastMax - firstMax : 0;
  const trendText =
    delta >= 3 ? "Warming trend" : delta <= -3 ? "Cooling trend" : "Stable week";
  const wettestDay = days.reduce((highest, day) =>
    day.rainChanceMax > highest.rainChanceMax
      ? day
      : highest
  );
  const wettestLabel =
    wettestDay.rainChanceMax >= 25
      ? `${formatDayLabel(wettestDay.date)} peaks at ${wettestDay.rainChanceMax}% rain chance`
      : "Rain chances stay mostly low";
  const weekRangeText = `${toDisplayTemp(weekMin, unit, weatherDataUnit)}\u00B0 to ${toDisplayTemp(weekMax, unit, weatherDataUnit)}\u00B0`;

  return `${trendText} \u00b7 ${weekRangeText} \u00b7 ${wettestLabel}`;
}

function DayRow({ day, weekMin, weekMax, unit, weatherDataUnit, rangeGradient }) {
  const info = getWeather(day.conditionCode);
  const label = formatDayLabel(day.date);
  const high = Number.isFinite(day.temperatureMax)
    ? toDisplayTemp(day.temperatureMax, unit, weatherDataUnit)
    : "\u2014";
  const low = Number.isFinite(day.temperatureMin)
    ? toDisplayTemp(day.temperatureMin, unit, weatherDataUnit)
    : "\u2014";
  const tempUnit = "\u00B0";
  const rainChance = day.rainChanceMax;
  const hasNotableRainChance = rainChance >= 20;
  const daySignal = getDaySignal(day, weekMin, weekMax);

  const weekRange = weekMax - weekMin || 1;
  const startPct = Number.isFinite(day.temperatureMin)
    ? clamp(((day.temperatureMin - weekMin) / weekRange) * 100, 0, 100)
    : 0;
  const endPct = Number.isFinite(day.temperatureMax)
    ? clamp(((day.temperatureMax - weekMin) / weekRange) * 100, 0, 100)
    : 0;

  return (
    <li className="forecast-row" role="listitem">
      <div className="forecast-day-wrap">
        <div className="forecast-day">{label}</div>
        <div className="forecast-day-meta">
          <div className="forecast-condition">{info.label}</div>
          <span className={`forecast-signal-chip forecast-signal-chip--${daySignal.tone}`}>
            {daySignal.label}
          </span>
        </div>
      </div>

      <div className="forecast-icon" aria-label={info.label}>
        <WeatherIcon code={day.conditionCode} size={22} />
      </div>

      <div
        className="forecast-temps"
        aria-label={`High ${high}${tempUnit}, low ${low}${tempUnit}`}
      >
        <div className="forecast-temp forecast-temp--high">
          <span className="forecast-temp-label">High</span>
          <span className="forecast-temp-value">
            {high}
            {tempUnit}
          </span>
        </div>
        <span className="forecast-temp-divider" aria-hidden="true" />
        <div className="forecast-temp forecast-temp--low">
          <span className="forecast-temp-label">Low</span>
          <span className="forecast-temp-value">
            {low}
            {tempUnit}
          </span>
        </div>
      </div>

      <div className="forecast-range" aria-hidden="true">
        <div
          className="forecast-range-bar"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(endPct - startPct, 3)}%`,
            background: rangeGradient,
          }}
        />
      </div>

      <div className="forecast-precip">
        {hasNotableRainChance ? (
          <>
            <Droplets size={11} />
            <span className="forecast-precip-value">{rainChance}%</span>
          </>
        ) : (
          <span className="forecast-precip-empty">Low</span>
        )}
      </div>
    </li>
  );
}

function ForecastCard({ weather, unit, weatherDataUnit = unit, style }) {
  const daily = weather?.daily && typeof weather.daily === "object" ? weather.daily : null;
  const times = Array.isArray(daily?.time) ? daily.time : [];
  const weatherCodes = Array.isArray(daily?.conditionCode) ? daily.conditionCode : [];
  const maxTemps = Array.isArray(daily?.temperatureMax)
    ? daily.temperatureMax
    : [];
  const minTemps = Array.isArray(daily?.temperatureMin)
    ? daily.temperatureMin
    : [];
  const precipProbabilities = Array.isArray(daily?.rainChanceMax)
    ? daily.rainChanceMax
    : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = times
    .map((date, index) => ({
      date,
      conditionCode: toFiniteNumber(weatherCodes[index], 0),
      temperatureMax: toFiniteNumber(maxTemps[index]),
      temperatureMin: toFiniteNumber(minTemps[index]),
      rainChanceMax: clampPercent(
        toFiniteNumber(precipProbabilities[index], 0)
      ),
    }))
    .filter((day) => Number.isFinite(day.temperatureMax) || Number.isFinite(day.temperatureMin))
    .filter((day) => {
      const dayDate = parseLocalDate(day.date);
      if (!dayDate || Number.isNaN(dayDate.getTime())) return false;
      dayDate.setHours(0, 0, 0, 0);
      return dayDate >= today;
    })
    .slice(0, 7);

  if (!days.length) {
    return (
      <section className="bento-forecast forecast-card" style={style}>
        <header className="forecast-header">
          <h2 className="forecast-title">
            <CalendarDays size={16} />
            <span>7-Day Forecast</span>
          </h2>
          <span className="forecast-subtitle">Upcoming week</span>
        </header>
        <p className="loader-text" role="status" aria-live="polite">
          7-day forecast is temporarily unavailable.
        </p>
      </section>
    );
  }

  const validWeekMins = days
    .map((day) => day.temperatureMin)
    .filter((value) => Number.isFinite(value));
  const validWeekMaxs = days
    .map((day) => day.temperatureMax)
    .filter((value) => Number.isFinite(value));
  const weekMin = validWeekMins.length ? Math.min(...validWeekMins) : 0;
  const weekMax = validWeekMaxs.length ? Math.max(...validWeekMaxs) : weekMin;
  const rangeGradientStart = weekMin <= 40 ? "#60a5fa" : "#f59e0b";
  const rangeGradientEnd =
    weekMax >= 95 ? "#ef4444" : weekMax >= 82 ? "#f97316" : "#fbbf24";
  const rangeGradient = `linear-gradient(to right, ${rangeGradientStart}, ${rangeGradientEnd})`;
  const weekSummary = buildWeekSummary(days, weekMin, weekMax, unit, weatherDataUnit);

  return (
    <section className="bento-forecast forecast-card" style={style}>
      <header className="forecast-header">
        <div className="forecast-heading">
          <h2 className="forecast-title">
            <CalendarDays size={16} />
            <span>7-Day Forecast</span>
          </h2>
          <p className="forecast-summary">{weekSummary}</p>
        </div>
        <span className="forecast-subtitle">Upcoming week</span>
      </header>

      <ul className="forecast-list" role="list">
        {days.map((day) => (
          <DayRow
            key={day.date}
            day={day}
            weekMin={weekMin}
            weekMax={weekMax}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            rangeGradient={rangeGradient}
          />
        ))}
      </ul>
    </section>
  );
}

export default ForecastCard;
