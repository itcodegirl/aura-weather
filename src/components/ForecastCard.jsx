import { CalendarDays, ChevronDown, Droplets } from "lucide-react";
import { memo, useCallback, useId, useMemo, useRef, useState } from "react";
import { formatWindSpeed, windDirectionName } from "../domain/wind";
import { getWeather } from "../domain/weatherCodes";
import {
  formatDayLabel,
  getIsoDateInTimeZone,
  parseLocalDate,
} from "../utils/dates";
import { formatSunClock } from "../utils/sunlight";
import { convertTemp } from "../utils/temperature";
import {
  MISSING_VALUE_PLACEHOLDER,
  toFiniteNumber as toStrictFiniteNumber,
} from "../utils/numbers";
import { useTimeNow } from "../hooks/useTimeNow";
import { CardHeader } from "./ui";
import WeatherIcon from "./WeatherIcon";
import "./ForecastCard.css";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Wraps the strict shared helper so callers can pass an explicit
// fallback (e.g. condition code defaults to 0/Clear, while a missing
// daily high temperature should remain NaN so the row uses the shared
// missing-value placeholder).
function toFiniteNumber(value, fallback = NaN) {
  const parsed = toStrictFiniteNumber(value);
  return parsed === null ? fallback : parsed;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getDaySignal(day, weekMin, weekMax) {
  const rainChance = day.rainChanceMax;
  if (rainChance >= 60) {
    return { label: "Rain Watch", tone: "wet" };
  }
  // weekMin/weekMax are null when the whole week lacks that reading;
  // without the finite guards the null would coerce to 0 in the
  // comparison and hand out fake Warm Peak / Cool Dip badges.
  if (
    Number.isFinite(weekMax) &&
    Number.isFinite(day.temperatureMax) &&
    day.temperatureMax >= weekMax - 1
  ) {
    return { label: "Warm Peak", tone: "warm" };
  }
  if (
    Number.isFinite(weekMin) &&
    Number.isFinite(day.temperatureMin) &&
    day.temperatureMin <= weekMin + 1
  ) {
    return { label: "Cool Dip", tone: "cool" };
  }
  // "Steady" is a claim about the day; a missing rain chance cannot
  // support it. Saying so beats a fake all-clear.
  if (rainChance === null) {
    return { label: "Partial data", tone: "limited" };
  }
  return { label: "Steady", tone: "steady" };
}

function toDisplayTemp(value, unit) {
  const converted = convertTemp(value, unit);
  return Number.isFinite(converted) ? Math.round(converted) : null;
}

function formatForecastTemp(value, unit) {
  const displayValue = Number.isFinite(value) ? toDisplayTemp(value, unit) : null;
  if (displayValue === null) {
    return {
      text: MISSING_VALUE_PLACEHOLDER,
      ariaText: "unavailable",
      isMissing: true,
    };
  }

  return {
    text: `${displayValue}\u00B0`,
    ariaText: `${displayValue} degrees`,
    isMissing: false,
  };
}

function buildForecastDays(weatherDaily, timeZone, todayIsoOverride) {
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
  const sunrises = Array.isArray(weatherDaily.sunrise) ? weatherDaily.sunrise : [];
  const sunsets = Array.isArray(weatherDaily.sunset) ? weatherDaily.sunset : [];
  const uvIndexMaxValues = Array.isArray(weatherDaily.uvIndexMax)
    ? weatherDaily.uvIndexMax
    : [];
  const windSpeedMaxValues = Array.isArray(weatherDaily.windSpeedMax)
    ? weatherDaily.windSpeedMax
    : [];
  const windGustMaxValues = Array.isArray(weatherDaily.windGustMax)
    ? weatherDaily.windGustMax
    : [];
  const windDirectionDominantValues = Array.isArray(
    weatherDaily.windDirectionDominant
  )
    ? weatherDaily.windDirectionDominant
    : [];

  // Daily entries are calendar dates in the *location's* timezone
  // (the forecast is requested with timezone=auto). Filtering against
  // the viewer's local "today" dropped the location's current day
  // entirely when the viewer was a calendar day ahead across the date
  // line (e.g. reading a Honolulu forecast from Tokyo).
  const todayIso = todayIsoOverride ?? getIsoDateInTimeZone(timeZone);

  return times
    .map((date, index) => ({
      date,
      conditionCode: toFiniteNumber(weatherCodes[index], 0),
      temperatureMax: toFiniteNumber(maxTemps[index]),
      temperatureMin: toFiniteNumber(minTemps[index]),
      rainChanceMax: clampPercent(
        toFiniteNumber(precipProbabilities[index])
      ),
      sunrise: typeof sunrises[index] === "string" ? sunrises[index] : "",
      sunset: typeof sunsets[index] === "string" ? sunsets[index] : "",
      uvIndexMax: toFiniteNumber(uvIndexMaxValues[index]),
      windSpeedMax: toFiniteNumber(windSpeedMaxValues[index]),
      windGustMax: toFiniteNumber(windGustMaxValues[index]),
      windDirectionDominant: toFiniteNumber(windDirectionDominantValues[index]),
    }))
    .filter((day) => Number.isFinite(day.temperatureMax) || Number.isFinite(day.temperatureMin))
    .filter((day) => {
      const dayDate = parseLocalDate(day.date);
      if (!dayDate || Number.isNaN(dayDate.getTime())) return false;
      // Validated ISO dates compare correctly as strings.
      return day.date.trim() >= todayIso;
    })
    .slice(0, 7);
}

function getForecastRangeGradient(weekMin, weekMax) {
  const rangeGradientStart = weekMin <= 40 ? "#60a5fa" : "#f59e0b";
  const rangeGradientEnd =
    weekMax >= 95 ? "#ef4444" : weekMax >= 82 ? "#f97316" : "#fbbf24";
  return `linear-gradient(to right, ${rangeGradientStart}, ${rangeGradientEnd})`;
}

function formatUvIndex(value) {
  if (!Number.isFinite(value)) {
    return MISSING_VALUE_PLACEHOLDER;
  }

  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

function buildDayWhy(daySignal, day) {
  const pct = day.rainChanceMax;
  switch (daySignal.tone) {
    case "warm":
      return "Warmest day of the stretch — light layers and sunscreen.";
    case "cool":
      return "Coolest day this week — bring a jacket for the morning.";
    case "wet":
      return pct !== null && pct >= 80
        ? `High rain chance at ${pct}% — an umbrella is a must.`
        : `Showers expected at ${pct}% — keep an umbrella handy.`;
    case "steady":
      return "Calm and consistent — the forecast looks predictable for the day.";
    default:
      return "Some readings are missing; forecast may be incomplete for this day.";
  }
}

function buildMiniSvgPath(temps) {
  const n = temps.length;
  const W = 600, H = 70, padX = 8, topPad = 8, botPad = 22;
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const rng = max - min || 1;
  const pts = temps.map((t, i) => [
    padX + (i * (W - 2 * padX)) / (n - 1),
    topPad + (1 - (t - min) / rng) * (H - topPad - botPad),
  ]);
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n - 1; i++) {
    const xc = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1);
    const yc = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
    line += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${xc},${yc}`;
  }
  const last = pts[n - 1];
  line += ` Q${last[0].toFixed(1)},${last[1].toFixed(1)} ${last[0].toFixed(1)},${last[1].toFixed(1)}`;
  const baseY = H - botPad + 8;
  const band = `${line} L${last[0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`;
  return { line, band, min, max };
}

function ForecastMiniCurve({ temps }) {
  if (!temps || temps.length < 4) return null;
  const { line, band, min, max } = buildMiniSvgPath(temps);
  const hi = Math.round(max);
  const lo = Math.round(min);
  return (
    <div className="forecast-mini-curve">
      <div className="forecast-mini-curve-header">
        <span className="forecast-mini-curve-label">Hourly temperature</span>
        <span className="forecast-mini-curve-range">H {hi}° · L {lo}°</span>
      </div>
      <svg
        viewBox="0 0 600 70"
        preserveAspectRatio="none"
        className="forecast-mini-curve-svg"
        role="img"
        aria-label={`Hourly temperature curve, high ${hi}°, low ${lo}°`}
      >
        <path d={band} fill="rgba(243,183,101,.16)" />
        <path d={line} fill="none" stroke="#f3b765" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="forecast-mini-curve-axis" aria-hidden="true">
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  );
}

function formatWindSummary(day, unit) {
  const speed = toFiniteNumber(day.windSpeedMax);
  if (!Number.isFinite(speed)) {
    return {
      value: MISSING_VALUE_PLACEHOLDER,
      detail: "",
      isMissing: true,
    };
  }

  const direction = windDirectionName(day.windDirectionDominant);
  const gust = toFiniteNumber(day.windGustMax);

  return {
    value: `${direction} ${formatWindSpeed(speed, unit)}`,
    detail: Number.isFinite(gust) ? `Gusts ${formatWindSpeed(gust, unit)}` : "",
    isMissing: false,
  };
}

function DetailMetric({ label, value, detail = "", isMissing = false }) {
  return (
    <div className="forecast-detail-metric">
      <dt className="forecast-detail-label">{label}</dt>
      <dd
        className={`forecast-detail-value${isMissing ? " is-missing" : ""}`}
      >
        {value}
      </dd>
      {detail ? <span className="forecast-detail-note">{detail}</span> : null}
    </div>
  );
}

function DayRow({
  day,
  weekMin,
  weekMax,
  unit,
  timeZone,
  todayIso,
  rangeGradient,
  isExpanded,
  onToggle,
  hourlyTemps,
}) {
  const triggerRef = useRef(null);
  const info = getWeather(day.conditionCode);
  const label = formatDayLabel(day.date, { timeZone, todayIso });
  const high = formatForecastTemp(day.temperatureMax, unit);
  const low = formatForecastTemp(day.temperatureMin, unit);
  const rainChance = day.rainChanceMax;
  const hasRainChance = Number.isFinite(rainChance);
  const hasNotableRainChance = hasRainChance && rainChance >= 20;
  const daySignal = getDaySignal(day, weekMin, weekMax);
  const hasTemperatureRange =
    Number.isFinite(day.temperatureMin) && Number.isFinite(day.temperatureMax);

  const weekRange = weekMax - weekMin || 1;
  const startPct = Number.isFinite(day.temperatureMin)
    ? clamp(((day.temperatureMin - weekMin) / weekRange) * 100, 0, 100)
    : 0;
  const endPct = Number.isFinite(day.temperatureMax)
    ? clamp(((day.temperatureMax - weekMin) / weekRange) * 100, 0, 100)
    : 0;
  const detailPanelId = `forecast-detail-${day.date}`;
  const windSummary = formatWindSummary(day, unit);
  const sunriseLabel = formatSunClock(day.sunrise);
  const sunsetLabel = formatSunClock(day.sunset);

  // Escape collapses the open detail panel and returns focus to the
  // trigger, matching the dismiss behavior of InfoDrawer so keyboard
  // users get one consistent close gesture across disclosures.
  const handleRowKeyDown = (event) => {
    if (event.key !== "Escape" || !isExpanded) {
      return;
    }
    event.stopPropagation();
    onToggle(day.date);
    triggerRef.current?.focus();
  };

  return (
    <li
      className={`forecast-row${isExpanded ? " is-expanded" : ""}`}
      role="listitem"
      onKeyDown={handleRowKeyDown}
    >
      <button
        type="button"
        ref={triggerRef}
        className="forecast-row-trigger"
        aria-expanded={isExpanded}
        aria-controls={detailPanelId}
        aria-label={`${isExpanded ? "Hide" : "Show"} forecast details for ${label}`}
        onClick={() => onToggle(day.date)}
      >
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
          aria-label={`High ${high.ariaText}, low ${low.ariaText}`}
        >
          <div className="forecast-temp forecast-temp--high">
            <span className="forecast-temp-label">High</span>
            <span
              className={`forecast-temp-value ${high.isMissing ? "is-missing" : ""}`.trim()}
              aria-label={high.isMissing ? "High unavailable" : undefined}
            >
              {high.text}
            </span>
          </div>
          <span className="forecast-temp-divider" aria-hidden="true" />
          <div className="forecast-temp forecast-temp--low">
            <span className="forecast-temp-label">Low</span>
            <span
              className={`forecast-temp-value ${low.isMissing ? "is-missing" : ""}`.trim()}
              aria-label={low.isMissing ? "Low unavailable" : undefined}
            >
              {low.text}
            </span>
          </div>
        </div>

        <div
          className={`forecast-range ${hasTemperatureRange ? "" : "forecast-range--missing"}`.trim()}
          aria-hidden="true"
        >
          {hasTemperatureRange ? (
            <div
              className="forecast-range-bar"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(endPct - startPct, 3)}%`,
                background: rangeGradient,
              }}
            />
          ) : null}
        </div>

        <div
          className="forecast-precip"
          aria-label={
            hasNotableRainChance
              ? `Rain chance ${rainChance} percent`
              : !hasRainChance
                ? "Rain chance unavailable"
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
          ) : !hasRainChance ? (
            <span className="forecast-precip-empty is-missing" aria-hidden="true">
              {MISSING_VALUE_PLACEHOLDER}
            </span>
          ) : (
            <span className="forecast-precip-empty" aria-hidden="true">
              Low
            </span>
          )}
        </div>

        <span className="forecast-details-btn" aria-hidden="true">
          <span className="forecast-details-btn-text">Details</span>
          <ChevronDown
            size={13}
            className={`forecast-details-btn-chevron${isExpanded ? " is-expanded" : ""}`}
          />
        </span>
      </button>

      {isExpanded ? (
        <div
          id={detailPanelId}
          className="forecast-detail-panel"
          role="region"
          aria-label={`${label} forecast details`}
        >
          <p className="forecast-detail-why">{buildDayWhy(daySignal, day)}</p>
          <ForecastMiniCurve temps={hourlyTemps} />
          <dl className="forecast-detail-grid">
            <DetailMetric
              label="Rain chance"
              value={
                hasRainChance ? `${rainChance}%` : MISSING_VALUE_PLACEHOLDER
              }
              detail={hasRainChance && rainChance >= 50 ? "Bring rain gear" : ""}
              isMissing={!hasRainChance}
            />
            <DetailMetric
              label="Peak UV"
              value={formatUvIndex(day.uvIndexMax)}
              detail={
                Number.isFinite(day.uvIndexMax) && day.uvIndexMax >= 6
                  ? "Sun protection recommended"
                  : ""
              }
              isMissing={!Number.isFinite(day.uvIndexMax)}
            />
            <DetailMetric
              label="Wind"
              value={windSummary.value}
              detail={windSummary.detail}
              isMissing={windSummary.isMissing}
            />
            <DetailMetric
              label="Sunrise"
              value={sunriseLabel}
              isMissing={sunriseLabel === MISSING_VALUE_PLACEHOLDER}
            />
            <DetailMetric
              label="Sunset"
              value={sunsetLabel}
              isMissing={sunsetLabel === MISSING_VALUE_PLACEHOLDER}
            />
            <DetailMetric
              label="Range"
              value={`${high.text} / ${low.text}`}
              detail="Daytime high and overnight low"
              isMissing={high.isMissing && low.isMissing}
            />
          </dl>
        </div>
      ) : null}
    </li>
  );
}

const FORECAST_EMPTY_MESSAGE =
  "The 7-day outlook isn't available right now. Current conditions are still live above.";

function buildWeekSummary(days, weekMin, weekMax, unit, timeZone, todayIso) {
  if (!Array.isArray(days) || days.length === 0) {
    return FORECAST_EMPTY_MESSAGE;
  }

  const firstMax = days[0]?.temperatureMax;
  const lastMax = days[days.length - 1]?.temperatureMax;
  const delta =
    Number.isFinite(firstMax) && Number.isFinite(lastMax) ? lastMax - firstMax : 0;
  const trendText =
    delta >= 3 ? "Warming trend" : delta <= -3 ? "Cooling trend" : "Stable week";
  const wettestDay = days.reduce((highest, day) =>
    (day.rainChanceMax ?? -1) > (highest.rainChanceMax ?? -1)
      ? day
      : highest
  );
  const wettestLabel =
    wettestDay.rainChanceMax === null
      ? "Rain chance unavailable"
      : wettestDay.rainChanceMax >= 25
      ? `${formatDayLabel(wettestDay.date, { timeZone, todayIso })} peaks at ${wettestDay.rainChanceMax}% rain chance`
      : "Rain chances stay mostly low";
  const summaryParts = [trendText];
  if (Number.isFinite(weekMin) && Number.isFinite(weekMax)) {
    const weekMinText = formatForecastTemp(weekMin, unit).text;
    const weekMaxText = formatForecastTemp(weekMax, unit).text;
    summaryParts.push(`${weekMinText} to ${weekMaxText}`);
  }
  summaryParts.push(wettestLabel);

  return summaryParts.join(" \u00b7 ");
}

function ForecastCard({
  weather,
  unit,
  style,
  isRefreshing = false,
}) {
  const titleId = useId();
  const [expandedDate, setExpandedDate] = useState(null);
  const timeZone = weather?.meta?.timezone;
  // Minute tick -> day-granular todayIso. Rows therefore relabel at the
  // location's midnight (a tab left open overnight used to keep
  // yesterday's "Today"), while the string stays stable within a day so
  // memoized rows do not re-render per tick.
  const nowMs = useTimeNow(60_000);
  const todayIso = useMemo(
    () => getIsoDateInTimeZone(timeZone, new Date(nowMs)),
    [timeZone, nowMs]
  );
  const days = useMemo(
    () => buildForecastDays(weather?.daily, timeZone, todayIso),
    [weather?.daily, timeZone, todayIso]
  );
  const { weekMin, weekMax } = useMemo(() => {
    const validWeekMins = days
      .map((day) => day.temperatureMin)
      .filter((value) => Number.isFinite(value));
    const validWeekMaxs = days
      .map((day) => day.temperatureMax)
      .filter((value) => Number.isFinite(value));
    // null (not 0) when a whole week lacks a reading: the previous 0
    // fallback leaked into the summary as a fake "0\u00B0" bound.
    const nextWeekMin = validWeekMins.length ? Math.min(...validWeekMins) : null;
    const nextWeekMax = validWeekMaxs.length ? Math.max(...validWeekMaxs) : null;
    return {
      weekMin: nextWeekMin,
      weekMax: nextWeekMax,
    };
  }, [days]);
  const rangeGradient = useMemo(
    () => getForecastRangeGradient(weekMin, weekMax),
    [weekMin, weekMax]
  );
  const hourlyTempsByDate = useMemo(() => {
    const hourlyTime = weather?.hourly?.time;
    const hourlyTemp = weather?.hourly?.temperature;
    if (!Array.isArray(hourlyTime) || !Array.isArray(hourlyTemp)) return {};
    const map = {};
    for (let i = 0; i < hourlyTime.length; i++) {
      const t = hourlyTime[i];
      if (typeof t !== "string") continue;
      const dateStr = t.slice(0, 10);
      const raw = hourlyTemp[i];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(convertTemp(raw, unit));
      }
    }
    return map;
  }, [weather?.hourly, unit]);
  const weekSummary = useMemo(
    () => buildWeekSummary(days, weekMin, weekMax, unit, timeZone, todayIso),
    [days, weekMin, weekMax, unit, timeZone, todayIso]
  );
  const handleToggleDay = useCallback((date) => {
    setExpandedDate((currentDate) => (currentDate === date ? null : date));
  }, []);

  if (!days.length) {
    return (
      <section
        className="bento-forecast forecast-card glass"
        style={style}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
        aria-labelledby={titleId}
      >
        <CardHeader
          headerClassName="forecast-header"
          title="7-Day Forecast"
          titleId={titleId}
          titleTag="h3"
          titleClassName="forecast-title"
          icon={<CalendarDays size={16} />}
          leftClassName="forecast-heading"
          subtitle="Upcoming week"
          subtitleClassName="forecast-subtitle eyebrow-pill"
        />
        <div className="card-empty" role="status">
          <div className="card-empty__icon">
            <CalendarDays size={36} aria-hidden="true" />
          </div>
          <p className="card-empty__title">7-day outlook unavailable</p>
          <p className="card-empty__copy">
            Current conditions are still live above.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="bento-forecast forecast-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
      aria-labelledby={titleId}
    >
      <CardHeader
        headerClassName="forecast-header"
        title="7-Day Forecast"
        titleId={titleId}
        titleTag="h3"
        titleClassName="forecast-title"
        icon={<CalendarDays size={16} />}
        leftClassName="forecast-heading"
        summary={weekSummary}
        summaryClassName="forecast-summary"
        subtitle="Upcoming week"
        subtitleClassName="forecast-subtitle"
      />
      <ul className="forecast-list" role="list">
        {days.map((day) => (
          <MemoizedDayRow
            key={day.date}
            day={day}
            weekMin={weekMin}
            weekMax={weekMax}
            unit={unit}
            timeZone={timeZone}
            todayIso={todayIso}
            rangeGradient={rangeGradient}
            isExpanded={expandedDate === day.date}
            onToggle={handleToggleDay}
            hourlyTemps={hourlyTempsByDate[day.date] ?? null}
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
    prevProps.timeZone === nextProps.timeZone &&
    prevProps.todayIso === nextProps.todayIso &&
    prevProps.weekMin === nextProps.weekMin &&
    prevProps.weekMax === nextProps.weekMax &&
    prevProps.rangeGradient === nextProps.rangeGradient &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.day.date === nextProps.day.date &&
    prevProps.day.conditionCode === nextProps.day.conditionCode &&
    prevProps.day.temperatureMax === nextProps.day.temperatureMax &&
    prevProps.day.temperatureMin === nextProps.day.temperatureMin &&
    prevProps.day.rainChanceMax === nextProps.day.rainChanceMax &&
    prevProps.day.sunrise === nextProps.day.sunrise &&
    prevProps.day.sunset === nextProps.day.sunset &&
    prevProps.day.uvIndexMax === nextProps.day.uvIndexMax &&
    prevProps.day.windSpeedMax === nextProps.day.windSpeedMax &&
    prevProps.day.windGustMax === nextProps.day.windGustMax &&
    prevProps.day.windDirectionDominant === nextProps.day.windDirectionDominant &&
    prevProps.hourlyTemps === nextProps.hourlyTemps
);

export default memo(
  ForecastCard,
  (prevProps, nextProps) =>
    prevProps.weather?.daily === nextProps.weather?.daily &&
    prevProps.weather?.hourly === nextProps.weather?.hourly &&
    prevProps.weather?.meta?.timezone === nextProps.weather?.meta?.timezone &&
    prevProps.unit === nextProps.unit &&
    prevProps.style === nextProps.style &&
    prevProps.isRefreshing === nextProps.isRefreshing
);
