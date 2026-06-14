// src/components/HourlyCard.jsx

import { memo, useId, useMemo, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { formatWindSpeed } from "../domain/wind";
import { getZonedNow } from "../utils/dates";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/numbers";
import { CardHeader } from "./ui";
import WeatherIcon from "./WeatherIcon";
import "./HourlyCard.css";

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
    // Open-Meteo's hourly timestamps are the location's naive wall clock.
    // Compare against the location's "now" (not the device's) so the
    // window + Now marker stay aligned when viewing another time zone.
    now: getZonedNow(timeZone).getTime(),
    windowSize: 24,
    currentSlotToleranceMs: 60 * 60 * 1000,
  });
  if (idx < 0) {
    return [];
  }

  return hourly.time
    .slice(idx, idx + 24)
    .map((t, i) => {
      const timestamp = new Date(t);
      if (!Number.isFinite(timestamp.getTime())) return null;

      // toFiniteNumber rejects nullish/empty values, so a missing
      // hourly sample renders as a gap in the curve instead of a fake
      // 0 reading.
      const baseTemp = toFiniteNumber(hourly.temperature[idx + i]);
      const convertedTemp =
        baseTemp === null ? Number.NaN : toDisplayTemperature(baseTemp, unit);

      return {
        time: timestamp,
        label: timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        }),
        temp: Number.isFinite(convertedTemp) ? convertedTemp : null,
        rainChance: toFiniteNumber(hourly.rainChance?.[idx + i]),
        windGust: toFiniteNumber(hourly.windGust?.[idx + i]),
        code: hourly.conditionCode?.[idx + i] ?? 0,
      };
    })
    .filter(Boolean);
}

// Thin the 24h window to ~12 evenly-spaced points (every ~2 hours) so
// the curve can weave through readable, un-cramped icons. The current
// hour (index 0) is always kept so the strip still starts at "Now".
function thinHourly(data) {
  if (data.length <= 12) return data;
  const step = Math.ceil(data.length / 12);
  return data.filter((_, index) => index % step === 0);
}

// Each metric reads its own value off a point, paints the curve in its
// own colour, formats its own units, and names itself for the
// screen-reader summary. Temperature is the default landing view.
const METRICS = {
  temp: {
    key: "temp",
    label: "Temperature",
    color: "#f3b765",
    get: (point) => point.temp,
    format: (value) => `${Math.round(value)}°`,
    aria: "degrees",
  },
  precip: {
    key: "precip",
    label: "Precipitation",
    color: "#6fb7f2",
    get: (point) => point.rainChance,
    format: (value) => `${Math.round(value)}%`,
    aria: "percent chance",
  },
  wind: {
    key: "wind",
    label: "Wind",
    color: "#7fd0c4",
    get: (point) => point.windGust,
    format: (value, unit) => formatWindSpeed(value, unit),
    aria: "gusts",
  },
};
const METRIC_ORDER = ["temp", "precip", "wind"];

const FLOW_SVG_HEIGHT = 96;
const FLOW_TOP_PAD = 8;
const FLOW_SPAN = 46;
const FLOW_ICON_HALF = 11;

function buildFlowGeometry(points, metric) {
  const count = points.length;
  if (!count) return null;

  const rawValues = points.map((point) => toFiniteNumber(metric.get(point)));
  const finite = rawValues.filter((value) => value !== null);
  if (finite.length === 0) return null;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min || 1;

  const columns = points.map((point, index) => {
    const value = rawValues[index];
    const norm = value === null ? null : (value - min) / range;
    // Missing samples sit at mid-height so the gap reads as "unknown"
    // rather than a fake low/high point.
    const offset =
      norm === null
        ? FLOW_TOP_PAD + FLOW_SPAN * 0.5
        : FLOW_TOP_PAD + (1 - norm) * FLOW_SPAN;
    return {
      ...point,
      value,
      offset,
      cx: ((index + 0.5) / count) * 1000,
      cy: offset + FLOW_ICON_HALF,
    };
  });

  const drawn = columns.filter((column) => column.value !== null);
  let line = `M ${drawn[0].cx.toFixed(1)} ${drawn[0].cy.toFixed(1)}`;
  for (let i = 1; i < drawn.length - 1; i += 1) {
    const midX = ((drawn[i].cx + drawn[i + 1].cx) / 2).toFixed(1);
    const midY = ((drawn[i].cy + drawn[i + 1].cy) / 2).toFixed(1);
    line += ` Q ${drawn[i].cx.toFixed(1)} ${drawn[i].cy.toFixed(1)} ${midX} ${midY}`;
  }
  if (drawn.length > 1) {
    const last = drawn[drawn.length - 1];
    line += ` Q ${last.cx.toFixed(1)} ${last.cy.toFixed(1)} ${last.cx.toFixed(1)} ${last.cy.toFixed(1)}`;
  }
  const band =
    drawn.length > 1
      ? `${line} L ${drawn[drawn.length - 1].cx.toFixed(1)} ${FLOW_SVG_HEIGHT} L ${drawn[0].cx.toFixed(1)} ${FLOW_SVG_HEIGHT} Z`
      : "";

  return { columns, line, band, min, max };
}

const HOURLY_EMPTY_MESSAGE =
  "Hourly readings aren't available right now. Current conditions are still live above.";

function buildSummary(points, metric, unit) {
  const drawn = points
    .map((point) => toFiniteNumber(metric.get(point)))
    .filter((value) => value !== null);
  if (drawn.length === 0) {
    return `${metric.label} is unavailable for the next several hours.`;
  }
  const firstLabel = points[0]?.label || "now";
  const lastLabel = points[points.length - 1]?.label || "later";
  const min = Math.min(...drawn);
  const max = Math.max(...drawn);
  const current = toFiniteNumber(metric.get(points[0]));
  const currentText =
    current === null ? "unavailable" : metric.format(current, unit);
  return `${metric.label} from ${firstLabel} to ${lastLabel}: ranges ${metric.format(
    min,
    unit
  )} to ${metric.format(max, unit)} ${metric.aria}. Now ${currentText}.`;
}

function HourlyCard({ weather, unit, style, isRefreshing = false }) {
  const chartId = useId();
  const chartTitleId = `${chartId}-title`;
  const chartSummaryId = `${chartId}-summary`;
  const [metricKey, setMetricKey] = useState("temp");
  const metric = METRICS[metricKey] ?? METRICS.temp;

  const data = useMemo(
    () => thinHourly(buildHourlyData(weather?.hourly, unit, weather?.meta?.timezone)),
    [weather?.hourly, unit, weather?.meta?.timezone]
  );

  const hasUsableTemperatureSamples = data.some((entry) =>
    Number.isFinite(entry?.temp)
  );
  const geometry = useMemo(
    () => buildFlowGeometry(data, metric),
    [data, metric]
  );
  const summary = useMemo(
    () => buildSummary(data, metric, unit),
    [data, metric, unit]
  );
  const lede = useMemo(() => {
    if (!geometry) return null;
    const current = toFiniteNumber(metric.get(data[0]));
    const now =
      current === null ? null : `Now ${metric.format(current, unit)}`;
    const range = `${metric.format(geometry.min, unit)}–${metric.format(
      geometry.max,
      unit
    )}`;
    return now ? `${now} · ${range}` : `Range ${range}`;
  }, [geometry, data, metric, unit]);

  if (!data.length || !hasUsableTemperatureSamples) {
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

  const count = data.length;

  return (
    <section
      className="bento-chart hourly-chart glass"
      style={style}
      aria-labelledby={chartTitleId}
      aria-describedby={chartSummaryId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="chart-header">
        <h3 id={chartTitleId} className="chart-title">
          <LineIcon size={16} aria-hidden="true" />
          Hourly forecast
        </h3>
        <div
          className="hourly-metric-seg"
          role="group"
          aria-label="Choose the hourly metric"
        >
          {METRIC_ORDER.map((key) => {
            const option = METRICS[key];
            const isActive = key === metricKey;
            return (
              <button
                key={key}
                type="button"
                className={`hourly-metric-option${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => setMetricKey(key)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </header>

      <p className="chart-lede">{lede}</p>
      <p id={chartSummaryId} className="sr-only">
        {summary}
      </p>

      {geometry ? (
        <div className="hourly-flow">
          <div className="hourly-flow-times" aria-hidden="true">
            {geometry.columns.map((column, index) => (
              <span
                key={`t-${column.time.getTime()}`}
                className={`hourly-flow-time${index === 0 ? " is-now" : ""}`}
              >
                {index === 0 ? "Now" : column.label}
              </span>
            ))}
          </div>
          <div className="hourly-flow-track">
            <svg
              className="hourly-flow-svg"
              viewBox={`0 0 1000 ${FLOW_SVG_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${metric.label} curve over the next ${count * 2} hours`}
            >
              {geometry.band ? (
                <path
                  className="hourly-flow-band"
                  d={geometry.band}
                  fill={metric.color}
                  fillOpacity="0.14"
                />
              ) : null}
              <path
                className="hourly-flow-line"
                d={geometry.line}
                fill="none"
                stroke={metric.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="hourly-flow-cols">
              {geometry.columns.map((column) => {
                const info = getWeather(column.code);
                const valueText =
                  column.value === null
                    ? "—"
                    : metric.format(column.value, unit);
                return (
                  <div
                    key={`c-${column.time.getTime()}`}
                    className="hourly-flow-col"
                    style={{ marginTop: `${Math.round(column.offset)}px` }}
                  >
                    <span
                      className="hourly-flow-icon"
                      role="img"
                      aria-label={info.label}
                    >
                      <WeatherIcon code={column.code} size={22} />
                    </span>
                    <span
                      className={`hourly-flow-val${
                        column.value === null ? " is-missing" : ""
                      }`}
                      style={
                        column.value === null
                          ? undefined
                          : { color: metric.color }
                      }
                    >
                      {valueText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="hourly-flow-empty" role="status">
          {metric.label} isn’t available for the next several hours. Try
          another metric above.
        </p>
      )}
    </section>
  );
}

export default memo(HourlyCard);
