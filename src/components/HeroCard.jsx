// src/components/HeroCard.jsx

import { memo, useMemo } from "react";
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
import { toFiniteNumber } from "../utils/numbers";
import { formatWindSpeed } from "../domain/wind";
import { formatSunClock, formatDaylightLengthLabel } from "../utils/sunlight";
import WeatherIcon from "./WeatherIcon";
import { DataTrustMeta, Stat } from "./ui";
import "./HeroCard.css";

function HeroCard({
  weather,
  location,
  unit,
  climateComparison,
  showClimateContext = true,
  climateStatus = "idle",
  style,
  isRefreshing = false,
  lastUpdatedAt,
  climateLastUpdatedAt,
  nowMs,
}) {
  const heroData = useMemo(() => {
    if (!weather?.current || !location) {
      return null;
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
    const toDisplayTemp = (value) => {
      const converted = convertTemp(value, unit);
      return Number.isFinite(converted) ? Math.round(converted) : "\u2014";
    };

    const toDisplayTempDelta = (deltaValue) => {
      const numericDelta = Number(deltaValue);
      if (!Number.isFinite(numericDelta)) {
        return "\u2014";
      }
      const safeDelta = Math.abs(numericDelta);
      const convertedDelta = unit === "C" ? (safeDelta * 5) / 9 : safeDelta;
      return Math.round(convertedDelta);
    };
    const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
    const todayHigh = toDisplayTemp(weather?.daily?.temperatureMax?.[0]);
    const todayLow = toDisplayTemp(weather?.daily?.temperatureMin?.[0]);
    const windDisplay = formatWindSpeed(current.windSpeed, unit);
    const dewPoint = toDisplayTemp(current.dewPoint);
    const humidityValue = toFiniteNumber(current.humidity);
    const humidityDisplay =
      humidityValue === null ? "—" : `${Math.round(humidityValue)}%`;
    const pressureValue = toFiniteNumber(current.pressure);
    const pressureDisplay =
      pressureValue === null ? "—" : `${Math.round(pressureValue)} hPa`;
    const sunriseValue = weather?.daily?.sunrise?.[0] ?? "";
    const sunsetValue = weather?.daily?.sunset?.[0] ?? "";
    const sunriseLabel = formatSunClock(sunriseValue);
    const sunsetLabel = formatSunClock(sunsetValue);
    const daylightLabel = formatDaylightLengthLabel(sunriseValue, sunsetValue, {
      fallback: "\u2014",
    });
    const safeClimateComparison =
      climateComparison && typeof climateComparison === "object"
        ? climateComparison
        : null;
    const climateDifference = Number(safeClimateComparison?.difference);
    const hasClimateComparison = Number.isFinite(climateDifference);
    const climateDeltaRaw = hasClimateComparison
      ? climateDifference
      : null;
    const climateDelta = hasClimateComparison ? toDisplayTempDelta(climateDeltaRaw) : "\u2014";
    let climateDirection = "";
    if (hasClimateComparison) {
      if (climateDeltaRaw > 0) climateDirection = "warmer";
      else if (climateDeltaRaw < 0) climateDirection = "colder";
      else climateDirection = "about the same";
    }
    const sampleYearsValue = toFiniteNumber(safeClimateComparison?.sampleYears);
    const climateSource = hasClimateComparison
      ? `${sampleYearsValue ?? 30}-year`
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

    return {
      current,
      info,
      safeLocationName,
      safeLocationCountry,
      toDisplayTemp,
      tempUnit,
      todayHigh,
      todayLow,
      windDisplay,
      dewPoint,
      humidityDisplay,
      pressureDisplay,
      sunriseValue,
      sunsetValue,
      sunriseLabel,
      sunsetLabel,
      daylightLabel,
      hasClimateComparison,
      climateMessage,
      today,
    };
  }, [weather, location, unit, climateComparison]);

  if (!heroData) {
    return (
      <section
        className="bento-hero hero-card glass"
        style={style}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
      >
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

  const {
    current,
    info,
    safeLocationName,
    safeLocationCountry,
    toDisplayTemp,
    tempUnit,
    todayHigh,
    todayLow,
    windDisplay,
    dewPoint,
    humidityDisplay,
    pressureDisplay,
    sunriseValue,
    sunsetValue,
    sunriseLabel,
    sunsetLabel,
    daylightLabel,
    hasClimateComparison,
    climateMessage,
    today,
  } = heroData;
  const shouldShowClimateMeta = showClimateContext && climateStatus !== "disabled";
  const climateMetaStatusLabel =
    climateStatus === "loading"
      ? "Loading climate context"
      : climateStatus === "unavailable"
        ? "Climate context unavailable"
        : "";
  const climateMetaTitle =
    climateStatus === "loading"
      ? "Aura Weather is comparing current conditions against the historical Open-Meteo archive."
      : climateStatus === "unavailable"
        ? "The Open-Meteo historical archive did not return a usable response for this comparison."
        : "";
  const climateFallbackMessage =
    climateStatus === "loading"
      ? "Comparing today's conditions with the historical average..."
      : climateStatus === "unavailable"
        ? "Historical comparison is temporarily unavailable."
        : "";

  return (
    <section
      className="bento-hero hero-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
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
        <div
          className="hero-high-low"
          role="group"
          aria-label="Today's high and low temperatures"
        >
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
      <DataTrustMeta
        sourceLabel="Open-Meteo Forecast"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />
      {shouldShowClimateMeta && (
        <DataTrustMeta
          sourceLabel="Open-Meteo Archive"
          lastUpdatedAt={
            climateStatus === "ready" ? climateLastUpdatedAt ?? lastUpdatedAt : null
          }
          nowMs={nowMs}
          staleAfterMinutes={120}
          statusLabel={climateMetaStatusLabel}
          titleOverride={climateMetaTitle}
        />
      )}

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
          {!hasClimateComparison && climateFallbackMessage && (
            <p className="hero-insight">{climateFallbackMessage}</p>
          )}
        </div>
      </div>

      <div className="hero-sunlight" role="group" aria-label="Sunlight details">
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
        <Stat
          icon={<Wind size={18} />}
          label="Wind"
          value={windDisplay}
        />
        <Stat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={humidityDisplay}
        />
        <Stat
          icon={<Gauge size={18} />}
          label="Pressure"
          value={pressureDisplay}
        />
        <Stat
          icon={<Thermometer size={18} />}
          label="Dew Point"
          value={`${dewPoint}${tempUnit}`}
        />
      </div>
    </section>
  );
}

export default memo(HeroCard);


