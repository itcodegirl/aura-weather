// src/components/HourlyCard.jsx

import { memo, useId, useMemo } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { findWindowStartIndex } from "../utils/timeSeries";
import { CardHeader, DataTrustMeta } from "./ui";
import "./HourlyCard.css";

function toDisplayTemperature(value, unit) {
  const converted = convertTemp(value, unit);
  return Number.isFinite(converted) ? Math.round(converted) : Number.NaN;
}

function buildHourlyData(hourly, unit) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly.temperature) ||
    hourly.time.length === 0 ||
    hourly.temperature.length === 0
  ) {
    return [];
  }

  const idx = findWindowStartIndex(hourly.time, {
    windowSize: 24,
    // Snap "Now" to the current hour band rather than the next future
    // entry, so the Now indicator aligns with the active hour.
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

      const rawTemp = hourly.temperature[idx + i];
      const baseTemp = Number(rawTemp);
      const convertedTemp = Number.isFinite(baseTemp)
        ? toDisplayTemperature(baseTemp, unit)
        : Number.NaN;

      return {
        time: timestamp,
        label: timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        }),
        temp: Number.isFinite(convertedTemp) ? convertedTemp : null,
        code: hourly.conditionCode?.[idx + i] ?? 0,
      };
    })
    .filter(Boolean);
}

function buildChartGeometry(data, minTemp, maxTemp) {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const svgWidth = 720;
  const svgHeight = 240;
  const margins = {
    top: 18,
    right: 14,
    bottom: 32,
    left: 34,
  };
  const plotWidth = Math.max(1, svgWidth - margins.left - margins.right);
  const plotHeight = Math.max(1, svgHeight - margins.top - margins.bottom);
  const range = maxTemp - minTemp || 1;

  const toX = (index) => {
    if (data.length <= 1) {
      return margins.left + plotWidth / 2;
    }
    return margins.left + (index / (data.length - 1)) * plotWidth;
  };

  const toY = (temp) =>
    margins.top + ((maxTemp - temp) / range) * plotHeight;

  const points = data
    .map((entry, index) => {
      if (!Number.isFinite(entry?.temp)) {
        return null;
      }

      return {
        ...entry,
        x: toX(index),
        y: toY(entry.temp),
      };
    })
    .filter(Boolean);

  if (points.length === 0) {
    return null;
  }

  const linePath = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");

  const areaPath = [
    linePath,
    `L ${points[points.length - 1].x.toFixed(2)} ${(margins.top + plotHeight).toFixed(2)}`,
    `L ${points[0].x.toFixed(2)} ${(margins.top + plotHeight).toFixed(2)}`,
    "Z",
  ].join(" ");

  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, index) => {
    const t = index / (yTickCount - 1);
    const value = Math.round(maxTemp - t * range);
    const y = margins.top + t * plotHeight;
    return { value, y };
  });

  const xTicks = data
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => index % 3 === 0 || index === data.length - 1)
    .map(({ entry, index }) => ({
      x: toX(index),
      label: entry.label,
    }));

  return {
    svgWidth,
    svgHeight,
    margins,
    plotWidth,
    plotHeight,
    points,
    linePath,
    areaPath,
    yTicks,
    xTicks,
  };
}

function getHourlySummary(data, unit) {
  if (!Array.isArray(data) || data.length === 0) {
    return "Hourly temperature data is temporarily unavailable.";
  }

  const validTemps = data
    .map((entry) => Number(entry?.temp))
    .filter((value) => Number.isFinite(value));
  if (validTemps.length === 0) {
    return "Hourly temperature data is temporarily unavailable.";
  }

  const firstLabel = data[0]?.label || "now";
  const lastLabel = data[data.length - 1]?.label || "later";
  const current = validTemps[0];
  const minimum = Math.min(...validTemps);
  const maximum = Math.max(...validTemps);

  return `From ${firstLabel} to ${lastLabel}, temperatures range from ${minimum} to ${maximum} degrees ${unit}. Current reading is ${current} degrees ${unit}.`;
}

function HourlyCard({
  weather,
  unit,
  chartTopColor,
  chartBottomColor,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const currentWeatherCode = weather?.current?.conditionCode;
  const currentTemperature = weather?.current?.temperature;
  const chartId = useId();
  const chartTitleId = `${chartId}-title`;
  const chartSummaryId = `${chartId}-summary`;
  const chartGradientId = `${chartId}-temp-gradient`.replace(/:/g, "");
  const data = useMemo(() => buildHourlyData(weather?.hourly, unit), [
    weather?.hourly,
    unit,
  ]);
  const palette = useMemo(() => {
    const hourlyCodes = data
      .map((entry) => entry.code)
      .filter((value) => Number.isFinite(value));
    const primaryCode = currentWeatherCode ?? hourlyCodes[0] ?? 0;
    return getWeather(primaryCode).gradient || getWeather(0).gradient;
  }, [data, currentWeatherCode]);

  const topColor = chartTopColor || palette[0];
  const bottomColor = chartBottomColor || palette[2] || palette[1];
  const chartSummary = useMemo(() => getHourlySummary(data, unit), [data, unit]);

  const chartMetrics = useMemo(() => {
    const temps = data.map((d) => d.temp).filter((value) => Number.isFinite(value));
    const currentTemp = Number.isFinite(Number(currentTemperature))
      ? toDisplayTemperature(currentTemperature, unit)
      : Number.NaN;

    const safeMinTemp = temps.length
      ? Math.min(...temps)
      : Number.isFinite(currentTemp)
        ? currentTemp
        : 0;
    const safeMaxTemp = temps.length
      ? Math.max(...temps)
      : Number.isFinite(currentTemp)
        ? currentTemp
        : 0;

    return { currentTemp, safeMinTemp, safeMaxTemp };
  }, [data, unit, currentTemperature]);

  const chartLede = useMemo(() => {
    return Number.isFinite(chartMetrics.currentTemp)
      ? `Now ${chartMetrics.currentTemp}\u00B0${unit} \u00B7 Low ${Math.round(chartMetrics.safeMinTemp)}\u00B0 \u00B7 High ${Math.round(chartMetrics.safeMaxTemp)}\u00B0`
      : `Range ${Math.round(chartMetrics.safeMinTemp)}\u00B0 to ${Math.round(chartMetrics.safeMaxTemp)}\u00B0`;
  }, [chartMetrics, unit]);

  if (!data.length) {
    return (
      <section
        className="bento-chart hourly-chart glass"
        style={style}
        aria-labelledby={chartTitleId}
        aria-describedby={chartSummaryId}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
      >
        <CardHeader
          headerClassName="chart-header"
          title="Hourly Temperature"
          titleId={chartTitleId}
          titleTag="h3"
          titleClassName="chart-title"
          icon={<LineIcon size={16} />}
          subtitle="Next 24h"
          subtitleClassName="chart-subtitle"
        />
        <DataTrustMeta
          sourceLabel="Open-Meteo Hourly"
          lastUpdatedAt={lastUpdatedAt}
          nowMs={nowMs}
        />

        <div className="chart-body" style={{ display: "grid", placeItems: "center" }}>
          <p className="loader-text" role="status" aria-live="polite">
            Hourly temperature data is temporarily unavailable.
          </p>
        </div>
      </section>
    );
  }

  const minTemp = Math.floor(chartMetrics.safeMinTemp - 2);
  const maxTemp = Math.ceil(chartMetrics.safeMaxTemp + 2);
  const geometry = buildChartGeometry(data, minTemp, maxTemp);
  const nowPoint = geometry?.points?.[0] ?? null;

  return (
    <section
      className="bento-chart hourly-chart glass"
      style={style}
      aria-labelledby={chartTitleId}
      aria-describedby={chartSummaryId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <CardHeader
        headerClassName="chart-header"
        title="Hourly Temperature"
        titleId={chartTitleId}
        titleTag="h3"
        titleClassName="chart-title"
        icon={<LineIcon size={16} />}
        subtitle="Next 24h"
        subtitleClassName="chart-subtitle"
      />
      <DataTrustMeta
        sourceLabel="Open-Meteo Hourly"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />
      <p className="chart-lede">{chartLede}</p>

      <div className="chart-body">
        <p id={chartSummaryId} className="sr-only">
          {chartSummary}
        </p>
        {geometry ? (
          <svg
            className="hourly-svg"
            viewBox={`0 0 ${geometry.svgWidth} ${geometry.svgHeight}`}
            role="img"
            aria-label="Hourly temperature chart"
          >
            <defs>
              <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={topColor} stopOpacity={0.8} />
                <stop
                  offset="100%"
                  stopColor={bottomColor}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            {geometry.yTicks.map((tick) => (
              <g key={`y-${tick.value}-${tick.y}`}>
                <line
                  className="hourly-grid-line"
                  x1={geometry.margins.left}
                  y1={tick.y}
                  x2={geometry.margins.left + geometry.plotWidth}
                  y2={tick.y}
                />
                <text
                  className="hourly-y-label"
                  x={geometry.margins.left - 6}
                  y={tick.y + 3}
                >
                  {`${tick.value}\u00B0`}
                </text>
              </g>
            ))}

            {geometry.xTicks.map((tick) => (
              <text
                key={`x-${tick.x}-${tick.label}`}
                className="hourly-x-label"
                x={tick.x}
                y={geometry.svgHeight - 8}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            ))}

            {nowPoint ? (
              <g>
                <line
                  className="hourly-now-line"
                  x1={nowPoint.x}
                  y1={geometry.margins.top}
                  x2={nowPoint.x}
                  y2={geometry.margins.top + geometry.plotHeight}
                />
                <text
                  className="hourly-now-label"
                  x={nowPoint.x}
                  y={geometry.margins.top - 4}
                  textAnchor="middle"
                >
                  Now
                </text>
              </g>
            ) : null}

            <path
              className="hourly-area"
              d={geometry.areaPath}
              fill={`url(#${chartGradientId})`}
            />

            <path
              className="hourly-line"
              d={geometry.linePath}
              stroke={topColor}
            />

            {geometry.points.map((point) => {
              const info = getWeather(point.code);
              return (
                <circle
                  key={`point-${point.time.getTime()}`}
                  className="hourly-point"
                  cx={point.x}
                  cy={point.y}
                  r="3.2"
                  fill={topColor}
                >
                  <title>{`${point.label} - ${point.temp}\u00B0${unit} - ${info.label}`}</title>
                </circle>
              );
            })}
          </svg>
        ) : null}
      </div>
    </section>
  );
}

export default memo(HourlyCard);
