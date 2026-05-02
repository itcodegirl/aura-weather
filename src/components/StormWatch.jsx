// src/components/StormWatch.jsx

import { memo, useId, useMemo } from "react";
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
import {
  hasFiniteValue,
  toFiniteNumber,
  MISSING_VALUE_LABEL,
} from "../utils/missingData";
import { CardHeader, DataTrustMeta, InfoDrawer, Stat } from "./ui";
import "./StormWatch.css";

function StormRisk({ risk, cape, summaryId }) {
  const hasCape = hasFiniteValue(cape);
  const safeCape = hasCape ? Math.round(Number(cape)) : null;
  const stormRiskSummary = hasCape
    ? `Storm risk: ${risk.level}; level ${risk.score + 1} of 5 based on current conditions.`
    : "Storm risk unavailable: live CAPE reading missing.";

  return (
    <div className="storm-module">
      <CardHeader
        headerClassName="storm-module-top"
        title="Storm Risk"
        titleTag="h3"
        titleClassName="storm-module-header"
        icon={<Zap size={14} />}
        subtitle={(
          <span className="storm-module-subtitle-wrap">
            <span className="storm-module-kicker">Thunderstorm potential</span>
            <InfoDrawer
              label="About CAPE storm energy"
              title="What CAPE means"
              className="storm-help-drawer"
            >
              CAPE estimates how much rising energy the atmosphere has for thunderstorms. Higher CAPE values can support stronger storm growth when other ingredients align.
            </InfoDrawer>
          </span>
        )}
      />
      <div
        className="storm-level"
        style={{ color: hasCape ? risk.color : "#94a3b8" }}
        aria-describedby={summaryId}
      >
        {hasCape ? risk.level : MISSING_VALUE_LABEL}
      </div>
      <p className="storm-module-summary">
        {hasCape
          ? `Risk index ${risk.score + 1} of 5`
          : "Live storm energy reading unavailable"}
      </p>
      <div id={summaryId} className="storm-risk-accessibility">
        {stormRiskSummary}
      </div>
      <div className="storm-risk-meter" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="storm-risk-pip"
            style={{
              background:
                hasCape && i <= risk.score ? risk.color : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>
      <p className="storm-term-hint">
        CAPE estimates atmospheric storm energy. Higher values can support stronger storms.
      </p>
      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label={(
          <abbr title="Convective available potential energy">
            CAPE
          </abbr>
        )}
        value={hasCape ? `${safeCape} J/kg` : MISSING_VALUE_LABEL}
      />
    </div>
  );
}

function PressureTrend({ trend }) {
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
        subtitle={(
          <span className="storm-module-subtitle-wrap">
            <span className="storm-module-kicker">6h trend</span>
            <InfoDrawer
              label="About pressure trends"
              title="How pressure trend helps"
              className="storm-help-drawer"
            >
              Falling pressure can hint at a nearby low-pressure system and unsettled weather, while rising pressure often aligns with improving and more stable conditions.
            </InfoDrawer>
          </span>
        )}
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
  const sustainedSpeed = toFiniteNumber(current.windSpeed);
  const gustSpeed = toFiniteNumber(current.windGust);
  const directionValue = toFiniteNumber(current.windDirection);
  const hasSustained = sustainedSpeed !== null;
  const hasDirection = directionValue !== null;

  const sustainedDisplay = hasSustained
    ? formatWindSpeed(sustainedSpeed, unit)
    : MISSING_VALUE_LABEL;
  const gustsDisplay =
    gustSpeed !== null
      ? formatWindSpeed(gustSpeed, unit)
      : hasSustained
        ? formatWindSpeed(sustainedSpeed, unit)
        : MISSING_VALUE_LABEL;
  const direction = hasDirection
    ? windDirectionName(directionValue)
    : "";
  const strength = hasSustained
    ? classifyWind(sustainedSpeed, "F")
    : MISSING_VALUE_LABEL;
  const compassRotation = hasDirection ? directionValue + 180 : 0;
  const compassLabel = hasDirection
    ? `Wind from ${direction}`
    : "Wind direction unavailable";
  const summary = hasSustained
    ? hasDirection
      ? `Flow from ${direction}`
      : "Wind direction unavailable"
    : "Live wind reading unavailable";

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
      <p className="storm-module-summary">{summary}</p>

      <div className="wind-compass" role="img" aria-label={compassLabel}>
        <div className="wind-compass-ring">
          <span className="wind-compass-label wind-compass-n">N</span>
          <span className="wind-compass-label wind-compass-e">E</span>
          <span className="wind-compass-label wind-compass-s">S</span>
          <span className="wind-compass-label wind-compass-w">W</span>
          {hasDirection && (
            <span
              className="wind-compass-arrow"
              aria-hidden="true"
              style={{
                transform: `translate(-50%, -50%) rotate(${compassRotation}deg)`,
              }}
            >
              <ArrowUp size={16} strokeWidth={2.3} />
            </span>
          )}
        </div>
      </div>

      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label={
          hasSustained
            ? hasDirection
              ? `${sustainedDisplay} ${direction}`
              : sustainedDisplay
            : MISSING_VALUE_LABEL
        }
        value={hasSustained ? `Gusts ${gustsDisplay}` : ""}
      />
    </div>
  );
}

function ComfortIndex({ weather, unit }) {
  const dewpoint = toFiniteNumber(weather?.current?.dewPoint);
  const hasDewpoint = dewpoint !== null;
  const dewpointConverted = hasDewpoint ? convertTemp(dewpoint, unit) : null;
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const dewpointDisplay = Number.isFinite(dewpointConverted)
    ? `${Math.round(dewpointConverted)}${tempUnit}`
    : MISSING_VALUE_LABEL;
  const comfort = hasDewpoint ? classifyComfort(dewpoint, "F") : null;
  const comfortLevel = comfort?.level ?? MISSING_VALUE_LABEL;
  const comfortColor = comfort?.color ?? "#94a3b8";

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
      <div className="storm-level" style={{ color: comfortColor }}>
        {comfortLevel}
      </div>
      <p className="storm-module-summary">
        {hasDewpoint
          ? "Dew point driven comfort signal"
          : "Dew point reading unavailable"}
      </p>
      <div className="comfort-scale" aria-hidden="true">
        <div className="comfort-gradient" />
        {hasDewpoint && (
          <div
            className="comfort-marker"
            style={{ left: `${comfort.position}%` }}
          />
        )}
      </div>
      <Stat
        className="storm-detail"
        labelClassName="storm-detail-label"
        valueClassName="storm-detail-value"
        label="Dewpoint"
        value={dewpointDisplay}
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
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const stormRiskSummaryId = useId();
  const overviewCape = toFiniteNumber(weather?.hourly?.cape?.[0]);
  const hasOverviewCape = overviewCape !== null;
  const currentConditionCode = weather?.current?.conditionCode ?? 0;
  const overviewRisk = useMemo(
    () => classifyStormRisk(hasOverviewCape ? overviewCape : 0, currentConditionCode),
    [hasOverviewCape, overviewCape, currentConditionCode]
  );
  const overviewPressure = useMemo(
    () => calculatePressureTrend(weather?.hourly?.pressure, weather?.hourly?.time),
    [weather?.hourly?.pressure, weather?.hourly?.time]
  );
  const overviewWindSpeed = toFiniteNumber(weather?.current?.windSpeed);
  const hasOverviewWind = overviewWindSpeed !== null;
  const overviewWind = hasOverviewWind
    ? classifyWind(overviewWindSpeed, "F")
    : MISSING_VALUE_LABEL;

  return (
    <section
      className="bento-storm storm-watch glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="storm-header">
        <div className="storm-header-main">
          <h3 className="storm-title">
            <Zap size={16} />
            <span>Risk & Conditions</span>
          </h3>
          <p className="storm-lede">
            Storm risk, pressure trend, wind, and comfort signals in one panel.
          </p>
        </div>
        <span className="storm-subtitle">Storm watch</span>
      </header>
      <DataTrustMeta
        sourceLabel="Open-Meteo Forecast"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />

      <div className="storm-snapshot" role="list" aria-label="Storm snapshot">
        <span
          className="storm-snapshot-chip"
          role="listitem"
          style={{ "--chip-accent": hasOverviewCape ? overviewRisk.color : "#94a3b8" }}
        >
          <span className="storm-snapshot-label">Storm risk</span>
          <span className="storm-snapshot-value">
            {hasOverviewCape ? overviewRisk.level : MISSING_VALUE_LABEL}
          </span>
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
        <MemoizedStormRisk
          risk={overviewRisk}
          cape={hasOverviewCape ? overviewCape : null}
          summaryId={stormRiskSummaryId}
        />
        <MemoizedPressureTrend trend={overviewPressure} />
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
