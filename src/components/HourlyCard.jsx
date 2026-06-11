// src/components/HourlyCard.jsx

import { memo, useId, useMemo, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { getZonedNow } from "../utils/dates";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/numbers";
import { CardHeader } from "./ui";
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

      // toFiniteNumber rejects nullish/empty values, so a missing
      // hourly sample renders as a gap in the chart instead of a fake
      // 0°F point.
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

const HOURLY_EMPTY_MESSAGE =
  "Hourly temperatures aren't available right now. Current conditions are still live above.";

function getHourlySummary(data, unit) {
  if (!Array.isArray(data) || data.length === 0) {
    return HOURLY_EMPTY_MESSAGE;
  }

  // Strict coercion: a null entry.temp would silently land as 0 and
  // crash the min/max into a fake "0 degrees" reading in the summary.
  const validTemps = data
    .map((entry) => toFiniteNumber(entry?.temp))
    .filter((value) => value !== null);
  if (validTemps.length === 0) {
    return HOURLY_EMPTY_MESSAGE;
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
}) {
  const currentWeatherCode = weather?.current?.conditionCode;
  const currentTemperature = weather?.current?.temperature;
  const chartId = useId();
  const chartTitleId = `${chartId}-title`;
  const chartSummaryId = `${chartId}-summary`;
  const chartGradientId = `${chartId}-temp-gradient`.replace(/:/g, "");
  const [selectedSampleKey, setSelectedSampleKey] = useState(null);
  const data = useMemo(
    () => buildHourlyData(weather?.hourly, unit, weather?.meta?.timezone),
    [weather?.hourly, unit, weather?.meta?.timezone]
  );
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
    const baseCurrentTemp = toFiniteNumber(currentTemperature);
    const currentTemp =
      baseCurrentTemp === null
        ? Number.NaN
        : toDisplayTemperature(baseCurrentTemp, unit);

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

  const minTemp = Math.floor(chartMetrics.safeMinTemp - 2);
  const maxTemp = Math.ceil(chartMetrics.safeMaxTemp + 2);
  const geometry = buildChartGeometry(data, minTemp, maxTemp);
  const nowPoint = geometry?.points?.[0] ?? null;
  const hourlySamples = geometry?.points ?? [];
  const selectedSample =
    hourlySamples.find((point) => String(point.time.getTime()) === selectedSampleKey) ||
    hourlySamples[0] ||
    null;
  const selectedSampleWeather = selectedSample
    ? getWeather(selectedSample.code)
    : null;
  // Roving tabindex: the strip exposes one tab stop (the displayed
  // sample) and arrow keys move both focus and selection, so keyboard
  // users are not forced through up to 24 individual tab stops.
  const tabStopSampleKey = selectedSample
    ? String(selectedSample.time.getTime())
    : null;

  const handleStripKeyDown = (event) => {
    if (!hourlySamples.length) {
      return;
    }

    const sampleKeys = hourlySamples.map((point) =>
      String(point.time.getTime())
    );
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

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextKey = sampleKeys[nextIndex];
    setSelectedSampleKey(nextKey);
    event.currentTarget
      .querySelector(`[data-sample-key="${nextKey}"]`)
      ?.focus();
  };

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
        subtitle={
          // An API window shorter than a full day must not be
          // labelled as 24 hours of coverage.
          data.length === 24 ? "Next 24h" : `Next ${data.length}h`
        }
        subtitleClassName="chart-subtitle eyebrow-pill"
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
              // Separator is a middle dot rather than an ASCII hyphen so
              // screen-reader engines do not pronounce it as "minus" /
              // "dash". Matches the separator the rest of the app uses
              // for inline metadata (see HeroCard sunlight line).
              const tooltip = `${point.label} \u00B7 ${point.temp}\u00B0${unit} \u00B7 ${info.label}`;
              const pointKey = String(point.time.getTime());
              const isUserSelectedPoint = selectedSampleKey === pointKey;
              return (
                <g
                  key={`point-${pointKey}`}
                  className="hourly-point-group"
                >
                  {/* Visible point \u2014 kept small for chart density.
                      Grows when the matching explorer sample is
                      selected so keyboard/touch selection is mirrored
                      on the chart itself (radius, not transform, so the
                      cue survives prefers-reduced-motion). */}
                  <circle
                    className="hourly-point"
                    cx={point.x}
                    cy={point.y}
                    r={isUserSelectedPoint ? 4.8 : 3.2}
                    fill={topColor}
                  />
                  {/* Larger transparent hit area so hover and touch are
                      easy to land on. The native <title> drives the OS
                      tooltip; assistive tech gets the same values
                      through the chart summary and the sample explorer
                      (descendants of role="img" are presentational, so
                      a per-circle aria-label would never be announced). */}
                  <circle
                    className="hourly-point-hit"
                    cx={point.x}
                    cy={point.y}
                    r="14"
                    fill="transparent"
                  >
                    <title>{tooltip}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>

      {hourlySamples.length ? (
        /*
         * The explorer is the keyboard-accessible counterpart to the
         * hover-only SVG points. On small screens it is always visible
         * (touch has no hover); on larger screens it stays visually
         * collapsed until a sample button receives focus, so keyboard
         * users can read individual hours without changing the desktop
         * composition. role="group" (not role="list") because the
         * children are interactive buttons, not list items.
         */
        <div
          className="hourly-touch-explorer"
          role="group"
          aria-label="Hourly samples"
        >
          {/*
           * The selected-sample card displays the currently-shown
           * sample. Previously this paragraph had aria-live=polite
           * AND each sample button had aria-pressed + a verbose
           * aria-label — so a screen-reader user tapping a sample
           * heard the same info twice (button pressed state change
           * + live region update). Live region removed; the button
           * own state change carries the announcement.
           */}
          {selectedSample ? (
            <p className="hourly-selected-sample">
              <span>{selectedSample.label}</span>
              <strong>{selectedSample.temp}&deg;{unit}</strong>
              <span>{selectedSampleWeather?.label || "Weather sample"}</span>
            </p>
          ) : null}
          <div className="hourly-touch-strip" onKeyDown={handleStripKeyDown}>
            {hourlySamples.map((point) => {
              const key = String(point.time.getTime());
              const info = getWeather(point.code);
              const isSelected = selectedSample
                ? key === String(selectedSample.time.getTime())
                : false;
              // aria-current rather than aria-pressed: the highlighted
              // sample is "the one being displayed right now", not "a
              // toggle the user has switched on". aria-pressed=true
              // before the user has tapped anything announced as if a
              // selection had been made. aria-current=true only fires
              // once the user has actually selected a sample.
              const isUserSelection = selectedSampleKey === key;
              return (
                <button
                  key={`sample-${key}`}
                  type="button"
                  className={`hourly-touch-sample ${isSelected ? "is-selected" : ""}`.trim()}
                  aria-current={isUserSelection ? "true" : undefined}
                  aria-label={`Show ${point.label}, ${point.temp} degrees ${unit}, ${info.label}`}
                  data-sample-key={key}
                  tabIndex={key === tabStopSampleKey ? 0 : -1}
                  onClick={() => setSelectedSampleKey(key)}
                >
                  <span>{point.label}</span>
                  <strong>{point.temp}&deg;</strong>
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
