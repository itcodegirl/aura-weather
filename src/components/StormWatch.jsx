// src/components/StormWatch.jsx

import { memo, useId } from "react";
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
} from "../domain";
import { convertTemp } from "../utils/temperature";
import { formatWindSpeed } from "../domain/wind";
import { Stat, CardHeader } from "./ui";
import "./StormWatch.css";

function StormRisk({ weather, summaryId }) {
  const cape = Number(weather?.hourly?.cape?.[0]);
  const safeCape = Number.isFinite(cape) ? cape : 0;
  const currentCode = weather?.current?.conditionCode ?? 0;
  const risk = classifyStormRisk(safeCape, currentCode);
  const stormRiskSummary = `Storm risk: ${risk.level}; level ${risk.score + 1} of 5 based on current conditions.`;

  return (
    <div className="storm-module">
      <CardHeader
        headerClassName="storm-module-top"
        title="Storm Risk"
        titleTag="h3"
        titleClassName="storm-module-header"
        icon={<Zap size={14} />}
        subtitle="Convection"
        subtitleClassName="storm-module-kicker"
      />
      <div
        className="storm-level"
        style={{ color: risk.color }}
        aria-label={risk.level}
        aria-describedby={summaryId}
      >
        {risk.level}
      </div>
      <p className="storm-module-summary">Risk index {risk.score + 1} of 5</p>
      <div id={summaryId} className="storm-risk-accessibility">
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
      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label="CAPE"
        value={`${Math.round(safeCape)} J/kg`}
      />
    </div>
  );
}

function PressureTrend({ weather }) {
  const trend = calculatePressureTrend(
    weather?.hourly?.pressure,
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
      <CardHeader
        headerClassName="storm-module-top"
        title="Pressure"
        titleTag="h3"
        titleClassName="storm-module-header"
        icon={<Icon size={14} style={{ color: trendColor }} />}
        subtitle="6h trend"
        subtitleClassName="storm-module-kicker"
      />
      <div className="storm-level" style={{ color: trendColor }}>
        {trend.interpretation}
      </div>
      <p className="storm-module-summary">
        {hasCurrent ? `${Math.round(trend.current)} hPa current` : "Pressure data unavailable"}
      </p>
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
      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label={hasCurrent ? `${Math.round(trend.current)} hPa` : "Data unavailable"}
        value={
          hasCurrent
            ? `${trend.delta > 0 ? "+" : ""}${trend.delta.toFixed(1)} / 6h`
            : "N/A"
        }
        valueStyle={{ color: trendColor }}
      />
    </div>
  );
}

function WindIntelligence({
  weather,
  unit,
}) {
  const current = weather?.current && typeof weather.current === "object" ? weather.current : {};
  const safeWindSpeed = Number(current.windSpeed);
  const safeWindGusts = Number(current.windGust);
  const safeDirection = Number(current.windDirection);
  const sustained = Number.isFinite(safeWindSpeed) ? safeWindSpeed : 0;
  const directionDegrees = Number.isFinite(safeDirection) ? safeDirection : 0;

  const sustainedDisplay = formatWindSpeed(safeWindSpeed, unit);
  const gustsDisplay = formatWindSpeed(
    Number.isFinite(safeWindGusts) ? safeWindGusts : sustained,
    unit
  );
  const direction = windDirectionName(directionDegrees);
  const strength = classifyWind(sustained, "F");

  return (
    <div className="storm-module">
      <CardHeader
        headerClassName="storm-module-top"
        title="Wind"
        titleTag="h3"
        titleClassName="storm-module-header"
        icon={<Wind size={14} />}
        subtitle="Surface flow"
        subtitleClassName="storm-module-kicker"
      />
      <div className="storm-level">{strength}</div>
      <p className="storm-module-summary">Flow from {direction}</p>

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
              transform: `translate(-50%, -50%) rotate(${directionDegrees + 180}deg)`,
            }}
          >
            <ArrowUp size={16} strokeWidth={2.3} />
          </span>
        </div>
      </div>

      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label={`${sustainedDisplay} ${direction}`}
        value={`Gusts ${gustsDisplay}`}
      />
    </div>
  );
}

function ComfortIndex({ weather, unit }) {
  const dewpoint = weather?.current?.dewPoint;
  const safeDewpoint = Number(dewpoint);
  const dewpointConverted = convertTemp(safeDewpoint, unit);
  const dewpointDisplay = Number.isFinite(dewpointConverted)
    ? Math.round(dewpointConverted)
    : "\u2014";
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const comfort = classifyComfort(
    safeDewpoint,
    "F"
  );

  return (
    <div className="storm-module">
      <CardHeader
        headerClassName="storm-module-top"
        title="Comfort"
        titleTag="h3"
        titleClassName="storm-module-header"
        icon={<Droplets size={14} />}
        subtitle="Moisture"
        subtitleClassName="storm-module-kicker"
      />
      <div className="storm-level" style={{ color: comfort.color }}>
        {comfort.level}
      </div>
      <p className="storm-module-summary">Dew point driven comfort signal</p>
      <div className="comfort-scale" aria-hidden="true">
        <div className="comfort-gradient" />
        <div className="comfort-marker" style={{ left: `${comfort.position}%` }} />
      </div>
      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label="Dewpoint"
        value={`${dewpointDisplay}${tempUnit}`}
      />
    </div>
  );
}

const MemoizedStormRisk = memo(StormRisk);
const MemoizedPressureTrend = memo(PressureTrend);
const MemoizedWindIntelligence = memo(WindIntelligence);
const MemoizedComfortIndex = memo(ComfortIndex);

function StormWatch({
  weather,
  unit,
  style,
}) {
  const stormRiskSummaryId = useId();
  const overviewCape = Number(weather?.hourly?.cape?.[0]);
  const safeOverviewCape = Number.isFinite(overviewCape) ? overviewCape : 0;
  const overviewRisk = classifyStormRisk(
    safeOverviewCape,
    weather?.current?.conditionCode ?? 0
  );
  const overviewPressure = calculatePressureTrend(
    weather?.hourly?.pressure,
    weather?.hourly?.time
  );
  const overviewWindSpeed = Number(weather?.current?.windSpeed);
  const overviewWind = classifyWind(
    Number.isFinite(overviewWindSpeed) ? overviewWindSpeed : 0,
    "F"
  );

  return (
    <section className="bento-storm storm-watch glass" style={style}>
      <header className="storm-header">
        <div className="storm-header-main">
          <h2 className="storm-title">
            <Zap size={16} />
            <span>Atmospheric Signals</span>
          </h2>
          <p className="storm-lede">
            Curated risk and behavior indicators for near-term weather awareness.
          </p>
        </div>
        <span className="storm-subtitle">Intelligence panel</span>
      </header>

      <div className="storm-snapshot" role="list" aria-label="Storm snapshot">
        <span
          className="storm-snapshot-chip"
          role="listitem"
          style={{ "--chip-accent": overviewRisk.color }}
        >
          <span className="storm-snapshot-label">Storm risk</span>
          <span className="storm-snapshot-value">{overviewRisk.level}</span>
        </span>
        <span className="storm-snapshot-chip" role="listitem">
          <span className="storm-snapshot-label">Pressure trend</span>
          <span className="storm-snapshot-value">{overviewPressure.interpretation}</span>
        </span>
        <span className="storm-snapshot-chip" role="listitem">
          <span className="storm-snapshot-label">Wind profile</span>
          <span className="storm-snapshot-value">{overviewWind}</span>
        </span>
      </div>

      <div className="storm-grid">
        <MemoizedStormRisk weather={weather} summaryId={stormRiskSummaryId} />
        <MemoizedPressureTrend weather={weather} />
        <MemoizedWindIntelligence
          weather={weather}
          unit={unit}
        />
        <MemoizedComfortIndex
          weather={weather}
          unit={unit}
        />
      </div>
    </section>
  );
}

export default memo(StormWatch);
