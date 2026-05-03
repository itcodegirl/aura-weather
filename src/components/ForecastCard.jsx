import { CalendarDays, Droplets } from "lucide-react";
import { memo, useMemo } from "react";
import { getWeather } from "../domain/weatherCodes";
import { formatDayLabel, parseLocalDate } from "../utils/dates";
import { convertTemp } from "../utils/temperature";
import { toFiniteNumber as toStrictFiniteNumber } from "../utils/numbers";
import { CardHeader, DataTrustMeta } from "./ui";
import WeatherIcon from "./WeatherIcon";
import "./ForecastCard.css";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Wraps the strict shared helper so callers can pass an explicit
// fallback (e.g. condition code defaults to 0/Clear, while a missing
// daily high temperature should remain NaN so the row renders "—").
function toFiniteNumber(value, fallback = NaN) {
  const parsed = toStrictFiniteNumber(value);
  return parsed === null ? fallback : parsed;
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

function toDisplayTemp(value, unit) {
  const converted = convertTemp(value, unit);
  return Number.isFinite(converted) ? Math.round(converted) : "\u2014";
}

function buildForecastDays(weatherDaily) {
  if (!weatherDaily || typeof weatherDaily !== "object") {
    return [];
  }

  const times = Array.isArray(weatherDaily.time) ? weatherDaily.time : [];
  const weatherCodes = Array.isArray(weatherDaily.conditionCode)
    ? weatherDaily.conditionCode
    : [];
  const maxTemps = Array.isArray(weatherDaily.temperatureMax)
    ? weatherDaily.temperatureMax
    : [];
  const minTemps = Array.isArray(weatherDaily.temperatureMin)
    ? weatherDaily.temperatureMin
    : [];
  const precipProbabilities = Array.isArray(weatherDaily.rainChanceMax)
    ? weatherDaily.rainChanceMax
    : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return times
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
}

function getForecastRangeGradient(weekMin, weekMax) {
  const rangeGradientStart = weekMin <= 40 ? "#60a5fa" : "#f59e0b";
  const rangeGradientEnd =
    weekMax >= 95 ? "#ef4444" : weekMax >= 82 ? "#f97316" : "#fbbf24";
  return `linear-gradient(to right, ${rangeGradientStart}, ${rangeGradientEnd})`;
}

function DayRow({ day, weekMin, weekMax, unit, rangeGradient }) {
  const info = getWeather(day.conditionCode);
  const label = formatDayLabel(day.date);
  const high = Number.isFinite(day.temperatureMax)
    ? toDisplayTemp(day.temperatureMax, unit)
    : "\u2014";
  const low = Number.isFinite(day.temperatureMin)
    ? toDisplayTemp(day.temperatureMin, unit)
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

      <div className="forecast-icon" role="img" aria-label={info.label}>
        <WeatherIcon code={day.conditionCode} size={22} />
      </div>

      <div
        className="forecast-temps"
        role="group"
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

      <div
        className="forecast-precip"
        aria-label={
          hasNotableRainChance
            ? `Rain chance ${rainChance} percent`
            : "Low rain chance"
        }
      >
        {hasNotableRainChance ? (
          <>
            <Droplets size={11} aria-hidden="true" />
            <span className="forecast-precip-value" aria-hidden="true">
              {rainChance}%
            </span>
          </>
        ) : (
          <span className="forecast-precip-empty" aria-hidden="true">
            Low
          </span>
        )}
      </div>
    </li>
  );
}

function buildWeekSummary(days, weekMin, weekMax, unit) {
  if (!Array.isArray(days) || days.length === 0) {
    return "7-day forecast is temporarily unavailable.";
  }

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
  const weekRangeText = `${toDisplayTemp(weekMin, unit)}\u00B0 to ${toDisplayTemp(weekMax, unit)}\u00B0`;

  return `${trendText} \u00b7 ${weekRangeText} \u00b7 ${wettestLabel}`;
}

function ForecastCard({
  weather,
  unit,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const days = useMemo(
    () => buildForecastDays(weather?.daily),
    [weather?.daily]
  );
  const { weekMin, weekMax } = useMemo(() => {
    const validWeekMins = days
      .map((day) => day.temperatureMin)
      .filter((value) => Number.isFinite(value));
    const validWeekMaxs = days
      .map((day) => day.temperatureMax)
      .filter((value) => Number.isFinite(value));
    const nextWeekMin = validWeekMins.length ? Math.min(...validWeekMins) : 0;
    const nextWeekMax = validWeekMaxs.length ? Math.max(...validWeekMaxs) : nextWeekMin;
    return {
      weekMin: nextWeekMin,
      weekMax: nextWeekMax,
    };
  }, [days]);
  const rangeGradient = useMemo(
    () => getForecastRangeGradient(weekMin, weekMax),
    [weekMin, weekMax]
  );
  const weekSummary = useMemo(
    () => buildWeekSummary(days, weekMin, weekMax, unit),
    [days, weekMin, weekMax, unit]
  );

  if (!days.length) {
    return (
      <section
        className="bento-forecast forecast-card glass"
        style={style}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
      >
        <CardHeader
          headerClassName="forecast-header"
          title="7-Day Forecast"
          titleTag="h3"
          titleClassName="forecast-title"
          icon={<CalendarDays size={16} />}
          leftClassName="forecast-heading"
          subtitle="Upcoming week"
          subtitleClassName="forecast-subtitle"
        />
        <DataTrustMeta
          sourceLabel="Open-Meteo Daily"
          lastUpdatedAt={lastUpdatedAt}
          nowMs={nowMs}
        />
        <p className="loader-text" role="status" aria-live="polite">
          7-day forecast is temporarily unavailable.
        </p>
      </section>
    );
  }

  return (
    <section
      className="bento-forecast forecast-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <CardHeader
        headerClassName="forecast-header"
        title="7-Day Forecast"
        titleTag="h3"
        titleClassName="forecast-title"
        icon={<CalendarDays size={16} />}
        leftClassName="forecast-heading"
        summary={weekSummary}
        summaryClassName="forecast-summary"
        subtitle="Upcoming week"
        subtitleClassName="forecast-subtitle"
      />
      <DataTrustMeta
        sourceLabel="Open-Meteo Daily"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />

      <ul className="forecast-list" role="list">
        {days.map((day) => (
          <MemoizedDayRow
            key={day.date}
            day={day}
            weekMin={weekMin}
            weekMax={weekMax}
            unit={unit}
            rangeGradient={rangeGradient}
          />
        ))}
      </ul>
    </section>
  );
}

const MemoizedDayRow = memo(
  DayRow,
  (prevProps, nextProps) =>
    prevProps.unit === nextProps.unit &&
    prevProps.weekMin === nextProps.weekMin &&
    prevProps.weekMax === nextProps.weekMax &&
    prevProps.rangeGradient === nextProps.rangeGradient &&
    prevProps.day.date === nextProps.day.date &&
    prevProps.day.conditionCode === nextProps.day.conditionCode &&
    prevProps.day.temperatureMax === nextProps.day.temperatureMax &&
    prevProps.day.temperatureMin === nextProps.day.temperatureMin &&
    prevProps.day.rainChanceMax === nextProps.day.rainChanceMax
);

export default memo(
  ForecastCard,
  (prevProps, nextProps) =>
    prevProps.weather?.daily === nextProps.weather?.daily &&
    prevProps.unit === nextProps.unit &&
    prevProps.style === nextProps.style &&
    prevProps.isRefreshing === nextProps.isRefreshing &&
    prevProps.lastUpdatedAt === nextProps.lastUpdatedAt &&
    prevProps.nowMs === nextProps.nowMs
);
