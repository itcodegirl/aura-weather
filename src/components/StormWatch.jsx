// src/components/StormWatch.jsx

import { memo } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Wind,
  Droplets,
  ArrowUp,
} from "lucide-react";
import {
  classifyStormRisk,
  calculatePressureTrend,
  classifyComfort,
  windDirectionName,
  classifyWind,
} from "../utils/meteorology";
import { formatWindSpeed } from "../utils/windUnits";
import "./StormWatch.css";

function StormRisk({ weather }) {
  const cape = Number(weather?.hourly?.cape?.[0]);
  const safeCape = Number.isFinite(cape) ? cape : 0;
  const currentCode = weather?.current?.weather_code ?? 0;
  const risk = classifyStormRisk(safeCape, currentCode);
  const stormRiskSummary = `Storm risk: ${risk.level}; level ${risk.score + 1} of 5 based on current conditions.`;

  return (
    <div className="storm-module">
      <div className="storm-module-header">
        <Zap size={14} />
        <span>Storm Risk</span>
      </div>
      <div
        className="storm-level"
        style={{ color: risk.color }}
        aria-label={risk.level}
        aria-describedby="storm-risk-summary"
      >
        {risk.level}
      </div>
      <div id="storm-risk-summary" className="storm-risk-accessibility">
        {stormRiskSummary}
      </div>
      <div className="storm-risk-meter" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="storm-risk-pip"
            style={{
              background: i <= risk.score ? risk.color : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>
      <div className="storm-detail">
        <span className="storm-detail-label">CAPE</span>
        <span className="storm-detail-value">{Math.round(safeCape)} J/kg</span>
      </div>
    </div>
  );
}

function PressureTrend({ weather }) {
  const trend = calculatePressureTrend(
    weather?.hourly?.surface_pressure,
    weather?.hourly?.time
  );
  const hasCurrent = Number.isFinite(trend.current);
  const trendLabel = hasCurrent
    ? `Pressure trend chart: ${trend.interpretation}, current value ${Math.round(
        trend.current
      )} hPa, ${trend.delta >= 0 ? "+" : ""}${trend.delta.toFixed(1)} hPa over 6 hours.`
    : "Pressure trend unavailable.";

  const Icon =
    trend.direction === "rising"
      ? TrendingUp
      : trend.direction === "falling"
        ? TrendingDown
        : Minus;

  const trendColor =
    trend.direction === "rising"
      ? "#22c55e"
      : trend.direction === "falling"
        ? "#f97316"
        : "#94a3b8";

  const safeSparkline = Array.isArray(trend.sparkline) && trend.sparkline.length
    ? trend.sparkline
    : [trend.current ?? 0];
  const max = Math.max(...safeSparkline);
  const min = Math.min(...safeSparkline);
  const range = max - min || 1;
  const points = safeSparkline
    .map((val, i) => {
      const divisor = safeSparkline.length - 1 || 1;
      const x = (i / divisor) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="storm-module">
      <div className="storm-module-header">
        <Icon size={14} style={{ color: trendColor }} />
        <span>Pressure</span>
      </div>
      <div className="storm-level" style={{ color: trendColor }}>
        {trend.interpretation}
      </div>
      <svg
        className="pressure-sparkline"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={trendLabel}
      >
        <title>{trendLabel}</title>
        <desc>{trendLabel}</desc>
        <polyline
          points={points}
          fill="none"
          stroke={trendColor}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="storm-detail">
        <span className="storm-detail-label">
          {hasCurrent ? `${Math.round(trend.current)} hPa` : "No data"}
        </span>
        <span className="storm-detail-value" style={{ color: trendColor }}>
          {hasCurrent
            ? `${trend.delta > 0 ? "+" : ""}${trend.delta.toFixed(1)} / 6h`
            : "Unavailable"}
        </span>
      </div>
    </div>
  );
}

function WindIntelligence({ weather, unit, weatherDataUnit = unit }) {
  const current = weather?.current || {};
  const wind_speed_10m = current.wind_speed_10m;
  const wind_gusts_10m = current.wind_gusts_10m;
  const wind_direction_10m = current.wind_direction_10m;
  const safeWindSpeed = Number(wind_speed_10m);
  const safeWindGusts = Number(wind_gusts_10m);
  const safeDirection = Number(wind_direction_10m);
  const sustained = Number.isFinite(safeWindSpeed) ? Math.round(safeWindSpeed) : 0;

  const sustainedDisplay = formatWindSpeed(safeWindSpeed, unit, weatherDataUnit);
  const gustsDisplay = formatWindSpeed(
    Number.isFinite(safeWindGusts) ? safeWindGusts : safeWindSpeed,
    unit,
    weatherDataUnit
  );
  const direction = windDirectionName(Number.isFinite(safeDirection) ? safeDirection : 0);
  const strength = classifyWind(sustained, unit);

  return (
    <div className="storm-module">
      <div className="storm-module-header">
        <Wind size={14} />
        <span>Wind</span>
      </div>
      <div className="storm-level">{strength}</div>

      <div className="wind-compass" aria-label={`Wind from ${direction}`}>
        <div className="wind-compass-ring">
          <span className="wind-compass-label wind-compass-n">N</span>
          <span className="wind-compass-label wind-compass-e">E</span>
          <span className="wind-compass-label wind-compass-s">S</span>
          <span className="wind-compass-label wind-compass-w">W</span>
          <span
            className="wind-compass-arrow"
            aria-hidden="true"
            style={{
              transform: `translate(-50%, -50%) rotate(${(safeDirection || 0) + 180}deg)`,
            }}
          >
            <ArrowUp size={16} strokeWidth={2.3} />
          </span>
        </div>
      </div>

      <div className="storm-detail">
        <span className="storm-detail-label">
          {sustainedDisplay} {direction}
        </span>
        <span className="storm-detail-value">Gusts {gustsDisplay}</span>
      </div>
    </div>
  );
}

function ComfortIndex({ weather, unit, convertTemp }) {
  const dewpoint = weather?.current?.dew_point_2m;
  const safeDewpoint = Number(dewpoint);
  const dewpointDisplay = Number.isFinite(safeDewpoint)
    ? convertTemp(safeDewpoint)
    : "\u2014";
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const comfort = classifyComfort(
    Number.isFinite(safeDewpoint) ? safeDewpoint : 50,
    unit
  );

  return (
    <div className="storm-module">
      <div className="storm-module-header">
        <Droplets size={14} />
        <span>Comfort</span>
      </div>
      <div className="storm-level" style={{ color: comfort.color }}>
        {comfort.level}
      </div>
      <div className="comfort-scale" aria-hidden="true">
        <div className="comfort-gradient" />
        <div className="comfort-marker" style={{ left: `${comfort.position}%` }} />
      </div>
      <div className="storm-detail">
        <span className="storm-detail-label">Dewpoint</span>
        <span className="storm-detail-value">
          {dewpointDisplay}
          {tempUnit}
        </span>
      </div>
    </div>
  );
}

const MemoizedStormRisk = memo(StormRisk);
const MemoizedPressureTrend = memo(PressureTrend);
const MemoizedWindIntelligence = memo(WindIntelligence);
const MemoizedComfortIndex = memo(ComfortIndex);

function StormWatch({ weather, unit, weatherDataUnit, convertTemp, style }) {
  return (
    <section className="bento-storm storm-watch" style={style}>
      <header className="storm-header">
        <div className="storm-title">
          <Zap size={16} />
          <span>Storm Watch</span>
        </div>
        <span className="storm-subtitle">Atmospheric conditions</span>
      </header>

      <div className="storm-grid">
        <MemoizedStormRisk weather={weather} />
        <MemoizedPressureTrend weather={weather} />
        <MemoizedWindIntelligence
          weather={weather}
          unit={unit}
          weatherDataUnit={weatherDataUnit}
        />
        <MemoizedComfortIndex
          weather={weather}
          unit={unit}
          convertTemp={convertTemp}
        />
      </div>
    </section>
  );
}

export default memo(StormWatch);
