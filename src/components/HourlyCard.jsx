// src/components/HourlyCard.jsx

import { memo, useId, useMemo, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { WIND_SPEED_CONVERSION } from "../domain/wind";
import { getZonedNow } from "../utils/dates";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/numbers";
import { CardHeader } from "./ui";
import "./HourlyCard.css";

// ── Condition icon colours (from the Glacier mockup palette) ─────────────────
const IC = {
  sun: "#f3b765",
  cloud: "#c3d6f0",
  cloudDk: "#a9c4e6",
  rain: "#6fb7f2",
  moon: "#d8e2f2",
};

// Reusable cloud blob shape (matches mockup cloud() helper geometry exactly).
function CloudBlob({ fill, cx, cy, s = 1 }) {
  return (
    <g fill={fill}>
      <ellipse cx={cx} cy={cy + 3 * s} rx={8 * s} ry={4.2 * s} />
      <circle cx={cx - 3 * s} cy={cy} r={3.5 * s} />
      <circle cx={cx + 2.5 * s} cy={cy - 0.5 * s} r={4.3 * s} />
      <rect
        x={cx - 8 * s}
        y={cy + 1.2 * s}
        width={16 * s}
        height={4.4 * s}
        rx={2.2 * s}
      />
    </g>
  );
}

// Inline-SVG condition icon variants — no font dependency.
function SunInner() {
  return (
    <>
      <circle cx="12" cy="12" r="4.3" fill={IC.sun} />
      <g stroke={IC.sun} strokeWidth="1.7" strokeLinecap="round">
        <line x1="12" y1="2.4" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.6" />
        <line x1="2.4" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.6" y2="12" />
        <line x1="5.2" y1="5.2" x2="7" y2="7" />
        <line x1="17" y1="17" x2="18.8" y2="18.8" />
        <line x1="5.2" y1="18.8" x2="7" y2="17" />
        <line x1="17" y1="7" x2="18.8" y2="5.2" />
      </g>
    </>
  );
}

function MoonInner() {
  // crescent(13, 11, 7) from the mockup
  const r = 7, x = 13, y = 11;
  return (
    <path
      d={`M${x + r},${y} A${r} ${r} 0 1 1 ${(x - 0.2 * r).toFixed(2)},${(y - r * 0.95).toFixed(2)} A${(r * 0.78).toFixed(2)} ${(r * 0.78).toFixed(2)} 0 0 0 ${x + r},${y} Z`}
      fill={IC.moon}
    />
  );
}

function SunCloudInner() {
  return (
    <>
      <circle cx="8" cy="8" r="3.1" fill={IC.sun} />
      <g stroke={IC.sun} strokeWidth="1.45" strokeLinecap="round">
        <line x1="8" y1="1.7" x2="8" y2="3.6" />
        <line x1="1.7" y1="8" x2="3.6" y2="8" />
        <line x1="3.5" y1="3.5" x2="4.9" y2="4.9" />
        <line x1="12.5" y1="3.5" x2="11.1" y2="4.9" />
      </g>
      <CloudBlob fill={IC.cloud} cx={13} cy={13.6} s={0.92} />
    </>
  );
}

function MoonCloudInner() {
  // crescent(16.5, 8, 4.6) from the mockup
  const r = 4.6, x = 16.5, y = 8;
  return (
    <>
      <path
        d={`M${x + r},${y} A${r} ${r} 0 1 1 ${(x - 0.2 * r).toFixed(2)},${(y - r * 0.95).toFixed(2)} A${(r * 0.78).toFixed(2)} ${(r * 0.78).toFixed(2)} 0 0 0 ${x + r},${y} Z`}
        fill={IC.moon}
      />
      <CloudBlob fill={IC.cloud} cx={11.5} cy={14} s={0.9} />
    </>
  );
}

function CloudRainInner() {
  return (
    <>
      <CloudBlob fill={IC.cloudDk} cx={12} cy={9.3} s={1} />
      <g stroke={IC.rain} strokeWidth="1.9" strokeLinecap="round">
        <line x1="8.8" y1="18" x2="7.8" y2="21" />
        <line x1="12.4" y1="18" x2="11.4" y2="21.4" />
        <line x1="16" y1="18" x2="15" y2="21" />
      </g>
    </>
  );
}

const ICON_INNER = {
  sun: SunInner,
  moon: MoonInner,
  suncloud: SunCloudInner,
  mooncloud: MoonCloudInner,
  cloud: () => <CloudBlob fill={IC.cloud} cx={12} cy={10.5} s={1} />,
  cloudrain: CloudRainInner,
};

function getConditionKind(code, isDay) {
  const c =
    typeof code === "number" && Number.isFinite(code) ? Math.trunc(code) : 0;
  if (c === 0 || c === 1) return isDay ? "sun" : "moon";
  if (c === 2) return isDay ? "suncloud" : "mooncloud";
  if (c === 3 || c === 45 || c === 48) return "cloud";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) {
    return "cloudrain";
  }
  return "cloud"; // snow, fog fallback
}

function isDayHour(timestamp, sunriseStr, sunsetStr) {
  if (!timestamp || !sunriseStr || !sunsetStr) return true;
  try {
    const t = timestamp.getTime();
    const rise = new Date(sunriseStr).getTime();
    const set = new Date(sunsetStr).getTime();
    return Number.isFinite(rise) && Number.isFinite(set)
      ? t >= rise && t < set
      : true;
  } catch {
    return true;
  }
}

function ConditionIcon({ code, isDay }) {
  const kind = getConditionKind(code, isDay);
  const Inner = ICON_INNER[kind] ?? ICON_INNER.cloud;
  return (
    <svg
      viewBox="0 0 24 24"
      className="hourly-cond-icon"
      aria-hidden="true"
    >
      <Inner />
    </svg>
  );
}

// ── Metric config ─────────────────────────────────────────────────────────────

const METRIC_CONFIGS = {
  precip: { label: "Precipitation", color: "#6fb7f2", unitSuffix: "%" },
  temperature: { label: "Temperature", color: "#f3b765", unitSuffix: "°" },
  wind: { label: "Wind", color: "#79d8c9", unitSuffix: null },
};
const METRIC_KEYS = ["precip", "temperature", "wind"];

// ── Data helpers ──────────────────────────────────────────────────────────────

function toDisplayTemperature(value, unit) {
  const converted = convertTemp(value, unit);
  return Number.isFinite(converted) ? Math.round(converted) : Number.NaN;
}

function buildHourlyData(hourly, unit, timeZone) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly.temperature) ||
    hourly.time.length === 0 ||
    hourly.temperature.length === 0
  ) {
    return [];
  }

  const idx = findWindowStartIndex(hourly.time, {
    now: getZonedNow(timeZone).getTime(),
    windowSize: 24,
    currentSlotToleranceMs: 60 * 60 * 1000,
  });
  if (idx < 0) return [];

  return hourly.time
    .slice(idx, idx + 24)
    .map((t, i) => {
      const timestamp = new Date(t);
      if (!Number.isFinite(timestamp.getTime())) return null;

      const baseTemp = toFiniteNumber(hourly.temperature[idx + i]);
      const convertedTemp =
        baseTemp === null
          ? Number.NaN
          : toDisplayTemperature(baseTemp, unit);

      const rainChance = toFiniteNumber(hourly.rainChance?.[idx + i]);

      const rawGust = toFiniteNumber(hourly.windGust?.[idx + i]);
      const windGust =
        rawGust === null
          ? null
          : Math.round(unit === "C" ? rawGust * WIND_SPEED_CONVERSION : rawGust);

      return {
        time: timestamp,
        label: timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        }),
        temp: Number.isFinite(convertedTemp) ? convertedTemp : null,
        rainChance,
        windGust,
        code: hourly.conditionCode?.[idx + i] ?? 0,
      };
    })
    .filter(Boolean);
}

function getMetricValues(data, metric, unit) {
  const windUnitLabel = unit === "C" ? " km/h" : " mph";
  return data.map((entry) => {
    switch (metric) {
      case "precip": {
        const v = entry.rainChance;
        return {
          ...entry,
          value: v,
          displayValue: v !== null ? `${Math.round(v)}%` : null,
        };
      }
      case "wind": {
        const v = entry.windGust;
        return {
          ...entry,
          value: v,
          displayValue: v !== null ? `${v}${windUnitLabel}` : null,
        };
      }
      default: {
        // temperature
        const v = entry.temp;
        return {
          ...entry,
          value: v,
          displayValue: v !== null ? `${v}°` : null,
        };
      }
    }
  });
}

// ── SVG chart geometry ────────────────────────────────────────────────────────
// Matches the mockup's quadratic-bezier-with-midpoint algorithm exactly.
// The curve extends flat to x=0 and x=SVG_W so the fill goes full-bleed.

const SVG_W = 1000;
const SVG_H = 96;
const TOP_PAD = 18;
const Y_SPAN = 52;

function buildChartGeometry(metricValues) {
  const n = metricValues.length;
  if (n === 0) return null;

  const valid = metricValues.filter((e) => e.value !== null);
  if (valid.length < 2) return null;

  const allVals = valid.map((e) => e.value);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const rng = max - min || 1;

  const xs = metricValues.map((_, i) => (i + 0.5) / n * SVG_W);
  const ys = metricValues.map((e) =>
    e.value !== null
      ? TOP_PAD + (1 - (e.value - min) / rng) * Y_SPAN
      : TOP_PAD + Y_SPAN / 2
  );

  // Quadratic bezier path through consecutive midpoints (same as mockup)
  let core = "";
  for (let i = 0; i < n - 1; i++) {
    const xc = (xs[i] + xs[i + 1]) / 2;
    const yc = (ys[i] + ys[i + 1]) / 2;
    core += ` Q${xs[i].toFixed(1)},${ys[i].toFixed(1)} ${xc.toFixed(1)},${yc.toFixed(1)}`;
  }
  core += ` L${xs[n - 1].toFixed(1)},${ys[n - 1].toFixed(1)}`;

  // Extend flat to edges so the stroke and fill bleed to the card border
  const linePath = `M0,${ys[0].toFixed(1)} L${xs[0].toFixed(1)},${ys[0].toFixed(1)}${core} L${SVG_W},${ys[n - 1].toFixed(1)}`;
  const fillPath = `${linePath} L${SVG_W},${SVG_H} L0,${SVG_H} Z`;

  return { linePath, fillPath, xs, ys };
}

function buildMetricLede(metricValues, metric) {
  const valid = metricValues.filter((e) => e.value !== null);
  if (!valid.length) return "";
  const first = valid[0].value;
  const allVals = valid.map((e) => e.value);
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const cfg = METRIC_CONFIGS[metric];
  const suffix = cfg.unitSuffix ?? "";
  return `${cfg.label} · now ${Math.round(first)}${suffix} · range ${Math.round(lo)}–${Math.round(hi)}${suffix}`;
}

const HOURLY_EMPTY_MESSAGE =
  "Hourly data isn't available right now. Current conditions are still live above.";

// ── HourlyCard ────────────────────────────────────────────────────────────────

function HourlyCard({ weather, unit, style, isRefreshing = false }) {
  const [metric, setMetric] = useState("precip");
  const [selectedSampleKey, setSelectedSampleKey] = useState(null);

  const chartId = useId();
  const chartTitleId = `${chartId}-title`;
  const chartSummaryId = `${chartId}-summary`;
  const gradientId = `${chartId}-grad`.replace(/:/g, "");

  const data = useMemo(
    () =>
      buildHourlyData(
        weather?.hourly,
        unit,
        weather?.meta?.timezone
      ),
    [weather?.hourly, unit, weather?.meta?.timezone]
  );

  const metricValues = useMemo(
    () => getMetricValues(data, metric, unit),
    [data, metric, unit]
  );

  const hasUsableValues = metricValues.some((e) => e.value !== null);

  // Empty / unavailable state
  if (!data.length || !hasUsableValues) {
    return (
      <section
        className="bento-chart hourly-chart glass"
        style={style}
        aria-labelledby={chartTitleId}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
      >
        <CardHeader
          headerClassName="chart-header"
          title="Hourly forecast"
          titleId={chartTitleId}
          titleTag="h3"
          titleClassName="chart-title"
          icon={<LineIcon size={16} />}
          subtitle="Next 24h"
          subtitleClassName="chart-subtitle eyebrow-pill"
        />
        <div className="card-empty" role="status">
          <div className="card-empty__icon">
            <LineIcon size={36} aria-hidden="true" />
          </div>
          <p className="card-empty__title">Hourly chart unavailable</p>
          <p className="card-empty__copy">
            Current conditions are still live above.
          </p>
        </div>
      </section>
    );
  }

  const geometry = buildChartGeometry(metricValues);
  const cfg = METRIC_CONFIGS[metric];
  const lede = buildMetricLede(metricValues, metric);

  // Condition icon row: every 3rd hour (8 slots across 24h)
  const sunrise = weather?.daily?.sunrise?.[0];
  const sunset = weather?.daily?.sunset?.[0];
  const iconSlots = data.filter((_, i) => i % 3 === 0);

  // Touch explorer strip — all samples with valid values for current metric
  const allSamples = metricValues.filter((e) => e.value !== null);
  const selectedSample =
    allSamples.find(
      (e) => String(e.time.getTime()) === selectedSampleKey
    ) ||
    allSamples[0] ||
    null;
  const tabStopKey = selectedSample
    ? String(selectedSample.time.getTime())
    : null;
  const selectedSampleWeather = selectedSample
    ? getWeather(selectedSample.code)
    : null;

  const handleStripKeyDown = (event) => {
    if (!allSamples.length) return;
    const sampleKeys = allSamples.map((e) => String(e.time.getTime()));
    const activeKey =
      event.target instanceof HTMLElement
        ? event.target.dataset.sampleKey
        : null;
    const activeIndex = Math.max(0, sampleKeys.indexOf(activeKey));

    let nextIndex = null;
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(sampleKeys.length - 1, activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      nextIndex = Math.max(0, activeIndex - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sampleKeys.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextKey = sampleKeys[nextIndex];
    setSelectedSampleKey(nextKey);
    event.currentTarget
      .querySelector(`[data-sample-key="${nextKey}"]`)
      ?.focus();
  };

  // Chips to overlay: every 3rd valid point for temperature/wind density,
  // every 2nd for precipitation (fewer decimal swings to label).
  const chipStep = metric === "temperature" ? 3 : 2;

  return (
    <section
      className="bento-chart hourly-chart glass"
      style={style}
      aria-labelledby={chartTitleId}
      aria-describedby={chartSummaryId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      {/* ── Header row: title + metric selector ── */}
      <div className="chart-header">
        <h3 id={chartTitleId} className="chart-title">
          <LineIcon size={16} aria-hidden="true" />
          <span>Hourly forecast</span>
        </h3>
        <div
          className="hourly-metric-selector"
          role="group"
          aria-label="Chart metric"
        >
          {METRIC_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`hourly-metric-btn${metric === key ? " is-active" : ""}`}
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
            >
              {METRIC_CONFIGS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Time + condition icon row ── */}
      <div className="hourly-time-icon-row" aria-hidden="true">
        {iconSlots.map((entry) => {
          const isDay = isDayHour(entry.time, sunrise, sunset);
          return (
            <div
              key={String(entry.time.getTime())}
              className="hourly-icon-slot"
            >
              <span className="hourly-icon-time">{entry.label}</span>
              <ConditionIcon code={entry.code} isDay={isDay} />
            </div>
          );
        })}
      </div>

      {/* ── SVG chart + HTML chip overlay ── */}
      <div className="hourly-plot">
        <p id={chartSummaryId} className="sr-only">
          {lede || HOURLY_EMPTY_MESSAGE}
        </p>
        {geometry ? (
          <>
            <svg
              className="hourly-svg"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={cfg.color}
                    stopOpacity="0.42"
                  />
                  <stop
                    offset="48%"
                    stopColor={cfg.color}
                    stopOpacity="0.16"
                  />
                  <stop
                    offset="100%"
                    stopColor={cfg.color}
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {/* Gradient fill */}
              <path d={geometry.fillPath} fill={`url(#${gradientId})`} />
              {/* Glow stroke (thick, low opacity — drawn first, behind main) */}
              <path
                d={geometry.linePath}
                fill="none"
                stroke={cfg.color}
                strokeOpacity="0.22"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* Main stroke */}
              <path
                d={geometry.linePath}
                fill="none"
                stroke={cfg.color}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Value chips: absolutely-positioned HTML elements over the SVG.
                They naturally occlude the stroke behind them so no digit
                is ever crossed by the line. */}
            <div className="hourly-chips-overlay" aria-hidden="true">
              {metricValues
                .filter(
                  (e, i) => e.value !== null && i % chipStep === 0
                )
                .map((entry, idx) => {
                  const origIdx = metricValues.indexOf(entry);
                  const xPct = (
                    (origIdx + 0.5) /
                    metricValues.length *
                    100
                  ).toFixed(2);
                  const yPx = geometry.ys[origIdx].toFixed(1);
                  return (
                    <span
                      key={String(entry.time.getTime())}
                      className="hourly-chip"
                      style={{
                        left: `${xPct}%`,
                        top: `${yPx}px`,
                        color: cfg.color,
                      }}
                    >
                      {entry.displayValue}
                    </span>
                  );
                })}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Lede ── */}
      <p className="chart-lede">{lede}</p>

      {/* ── Touch / keyboard sample explorer ──
          All ARIA contracts from the original component are preserved:
          - role="group" on the explorer wrapper (not role="list")
          - aria-current on the selected sample only (never aria-pressed)
          - aria-label starts with "Show " on each sample button
          - aria-live is NOT on the selected-sample paragraph
          - Roving tabindex: one tab stop, arrows move selection */}
      {allSamples.length ? (
        <div
          className="hourly-touch-explorer"
          role="group"
          aria-label="Hourly samples"
        >
          {selectedSample ? (
            <p className="hourly-selected-sample">
              <span>{selectedSample.label}</span>
              <strong>{selectedSample.displayValue}</strong>
              <span>
                {selectedSampleWeather?.label || "Weather sample"}
              </span>
            </p>
          ) : null}
          <div
            className="hourly-touch-strip"
            onKeyDown={handleStripKeyDown}
          >
            {allSamples.map((entry) => {
              const key = String(entry.time.getTime());
              const info = getWeather(entry.code);
              const isSelected = selectedSample
                ? key === String(selectedSample.time.getTime())
                : false;
              const isUserSelection = selectedSampleKey === key;
              return (
                <button
                  key={`sample-${key}`}
                  type="button"
                  className={`hourly-touch-sample${isSelected ? " is-selected" : ""}`.trim()}
                  aria-current={isUserSelection ? "true" : undefined}
                  aria-label={`Show ${entry.label}, ${entry.displayValue ?? "no data"}, ${info.label}`}
                  data-sample-key={key}
                  tabIndex={key === tabStopKey ? 0 : -1}
                  onClick={() => setSelectedSampleKey(key)}
                >
                  <span>{entry.label}</span>
                  <strong>{entry.displayValue ?? "—"}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default memo(HourlyCard);
