// src/components/HeroCard.jsx

import { memo } from "react";
import {
  MapPin,
  Wind,
  Droplets,
  Gauge,
  Thermometer,
  Sunrise,
  Sunset,
  Sun,
} from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { formatWindSpeed } from "../domain/wind";
import WeatherIcon from "./WeatherIcon";
import { IconMetricStat } from "./ui";
import "./HeroCard.css";

function formatClock(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDaylightLength(sunrise, sunset) {
  if (!sunrise || !sunset) return "\u2014";
  const sunriseDate = new Date(sunrise);
  const sunsetDate = new Date(sunset);
  if (Number.isNaN(sunriseDate.getTime()) || Number.isNaN(sunsetDate.getTime())) {
    return "\u2014";
  }

  let diffMs = sunsetDate.getTime() - sunriseDate.getTime();
  if (diffMs <= 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}

function HeroCard({
  weather,
  location,
  unit,
  weatherDataUnit = unit,
  weatherWindSpeedUnit = "mph",
  climateComparison,
  style,
}) {
  if (!weather?.current || !location) {
    return (
      <section className="bento-hero hero-card" style={style}>
        <header className="hero-meta">
          <div className="hero-location">
            <MapPin size={14} />
            <span>Location unavailable</span>
          </div>
          <p className="hero-date">Loading weather</p>
        </header>
      </section>
    );
  }

  const current = weather.current;
  const safeLocation = location && typeof location === "object" ? location : {};
  const safeLocationName = typeof safeLocation.name === "string" && safeLocation.name.trim()
    ? safeLocation.name.trim()
    : "Current location";
  const safeLocationCountry = typeof safeLocation.country === "string" && safeLocation.country.trim()
    ? safeLocation.country.trim()
    : "";
  const info = getWeather(current.conditionCode);
  const toDisplayTemp = (value, sourceUnit = weatherDataUnit) => {
    const converted = convertTemp(value, unit, sourceUnit);
    return Number.isFinite(converted) ? Math.round(converted) : "\u2014";
  };
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const todayHigh = toDisplayTemp(weather?.daily?.temperatureMax?.[0]);
  const todayLow = toDisplayTemp(weather?.daily?.temperatureMin?.[0]);
  const windDisplay = formatWindSpeed(
    current.windSpeed,
    unit,
    weatherWindSpeedUnit
  );
  const dewPoint = toDisplayTemp(current.dewPoint);
  const sunriseValue = weather?.daily?.sunrise?.[0] ?? "";
  const sunsetValue = weather?.daily?.sunset?.[0] ?? "";
  const sunriseLabel = formatClock(sunriseValue);
  const sunsetLabel = formatClock(sunsetValue);
  const daylightLabel = formatDaylightLength(sunriseValue, sunsetValue);
  const safeClimateComparison =
    climateComparison && typeof climateComparison === "object"
      ? climateComparison
      : null;
  const climateDifference = Number(safeClimateComparison?.difference);
  const hasClimateComparison = Number.isFinite(climateDifference);
  const climateDeltaRaw = hasClimateComparison
    ? climateDifference
    : null;
  const climateDelta = hasClimateComparison
    ? toDisplayTemp(
        Math.abs(climateDeltaRaw),
        typeof safeClimateComparison?.differenceUnit === "string"
          ? safeClimateComparison.differenceUnit
          : "F"
      )
    : 0;
  let climateDirection = "";
  if (hasClimateComparison) {
    if (climateDeltaRaw > 0) climateDirection = "warmer";
    else if (climateDeltaRaw < 0) climateDirection = "colder";
    else climateDirection = "about the same";
  }
  const climateSource = hasClimateComparison
    ? `${Number.isFinite(Number(safeClimateComparison?.sampleYears))
        ? Number(safeClimateComparison.sampleYears)
        : 30}-year`
    : "";
  const climateDate =
    typeof safeClimateComparison?.referenceDateLabel === "string" &&
    safeClimateComparison.referenceDateLabel.trim()
      ? safeClimateComparison.referenceDateLabel.trim()
      : "today";
  const climateLocation = safeLocationName || "this location";
  const climateMessage = hasClimateComparison
    ? climateDirection === "about the same"
      ? `Today is about the same as the ${climateSource} average for ${climateDate} in ${climateLocation}, from the Open-Meteo historical archive.`
      : `Today is ${climateDelta}${tempUnit} ${climateDirection} than the ${climateSource} average for ${climateDate} in ${climateLocation}, from the Open-Meteo historical archive.`
    : "";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="bento-hero hero-card" style={style}>
      <header className="hero-meta">
        <div className="hero-location-block">
          <div className="hero-location">
            <MapPin size={14} />
            <span>
              {safeLocationName}
              {safeLocationCountry ? `, ${safeLocationCountry}` : ""}
            </span>
          </div>
          <p className="hero-date">{today}</p>
        </div>
        <div className="hero-high-low" aria-label="Today's high and low temperatures">
          <div className="hero-high-low-item">
            <span className="hero-high-low-label">High</span>
            <span className="hero-high-low-value">
              {todayHigh}
              {tempUnit}
            </span>
          </div>
          <div className="hero-high-low-item">
            <span className="hero-high-low-label">Low</span>
            <span className="hero-high-low-value">
              {todayLow}
              {tempUnit}
            </span>
          </div>
        </div>
      </header>

      <div className="hero-main">
        <div className="hero-temp-block">
          <div className="hero-temp-row">
            <div className="hero-temp">
              {toDisplayTemp(current.temperature)}
              <span className="hero-temp-unit">{tempUnit}</span>
            </div>
            <div className="hero-icon">
              <WeatherIcon code={current.conditionCode} size={124} animated />
            </div>
          </div>
          <div className="hero-condition">{info.label}</div>
          <div className="hero-feels">
            Feels like {toDisplayTemp(current.feelsLike)}
            {tempUnit}
          </div>
          {hasClimateComparison && (
            <p className="hero-insight">{climateMessage}</p>
          )}
        </div>
      </div>

      <div className="hero-sunlight" aria-label="Sunlight details">
        <div className="hero-sun-chip">
          <div className="hero-sun-label">
            <Sunrise size={14} />
            <span>Sunrise</span>
          </div>
          <time className="hero-sun-value" dateTime={sunriseValue || undefined}>
            {sunriseLabel}
          </time>
        </div>
        <div className="hero-sun-chip">
          <div className="hero-sun-label">
            <Sunset size={14} />
            <span>Sunset</span>
          </div>
          <time className="hero-sun-value" dateTime={sunsetValue || undefined}>
            {sunsetLabel}
          </time>
        </div>
        <div className="hero-sun-chip hero-sun-chip--daylight">
          <div className="hero-sun-label">
            <Sun size={14} />
            <span>Daylight</span>
          </div>
          <div className="hero-sun-value">{daylightLabel}</div>
        </div>
      </div>

      <div className="hero-stats">
        <IconMetricStat
          icon={<Wind size={18} />}
          label="Wind"
          value={windDisplay}
        />
        <IconMetricStat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={
            Number.isFinite(Number(current.humidity))
              ? `${Math.round(current.humidity)}%`
              : "\u2014"
          }
        />
        <IconMetricStat
          icon={<Gauge size={18} />}
          label="Pressure"
          value={
            Number.isFinite(Number(current.pressure))
              ? `${Math.round(current.pressure)} hPa`
              : "\u2014"
          }
        />
        <IconMetricStat
          icon={<Thermometer size={18} />}
          label="Dew Point"
          value={`${dewPoint}${tempUnit}`}
        />
      </div>
    </section>
  );
}

export default memo(HeroCard);
