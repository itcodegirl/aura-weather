// src/components/HourlyCard.jsx

import { memo, useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { convertTemperature } from "../utils/weatherUnits";
import "./HourlyCard.css";

function toDisplayTemperature(value, unit, sourceUnit) {
  const converted = convertTemperature(value, unit, sourceUnit);
  return Number.isFinite(converted) ? Math.round(converted) : Number.NaN;
}

function buildHourlyData(hourly, unit, sourceUnit) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    hourly.time.length === 0 ||
    hourly.temperature_2m.length === 0
  ) {
    return [];
  }

  const now = new Date();
  const nowMs = now.getTime();
  const startIdx = hourly.time.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= nowMs;
  });
  const idx = startIdx === -1 ? 0 : startIdx;

  return hourly.time
    .slice(idx, idx + 24)
    .map((t, i) => {
      const timestamp = new Date(t);
      if (!Number.isFinite(timestamp.getTime())) return null;

      const rawTemp = hourly.temperature_2m[idx + i];
      const baseTemp = Number(rawTemp);
      const convertedTemp = Number.isFinite(baseTemp)
        ? toDisplayTemperature(baseTemp, unit, sourceUnit)
        : Number.NaN;

      return {
        time: timestamp,
        label: timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        }),
        temp: Number.isFinite(convertedTemp) ? convertedTemp : null,
        code: hourly.weather_code?.[idx + i] ?? 0,
      };
    })
    .filter(Boolean);
}

function ChartTooltip({ active, payload, unit }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const info = getWeather(data.code);
  const tempText = Number.isFinite(data?.temp)
    ? `${data.temp}\u00B0${unit}`
    : "\u2014";

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-time">{data.label}</div>
      <div className="chart-tooltip-temp">{tempText}</div>
      <div className="chart-tooltip-condition">{info.label}</div>
    </div>
  );
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
  weatherDataUnit = unit,
  chartTopColor,
  chartBottomColor,
  style,
}) {
  const currentWeatherCode = weather?.current?.weather_code;
  const chartId = useId();
  const chartTitleId = `${chartId}-title`;
  const chartSummaryId = `${chartId}-summary`;
  const chartGradientId = `${chartId}-temp-gradient`.replace(/:/g, "");
  const data = useMemo(() => buildHourlyData(weather?.hourly, unit, weatherDataUnit), [
    weather?.hourly,
    unit,
    weatherDataUnit,
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

  if (!data.length) {
    return (
      <section
        className="bento-chart hourly-chart"
        style={style}
        aria-labelledby={chartTitleId}
        aria-describedby={chartSummaryId}
      >
        <header className="chart-header">
          <h2 id={chartTitleId} className="chart-title">
            <LineIcon size={16} />
            <span>Hourly Temperature</span>
          </h2>
          <span className="chart-subtitle">Next 24h</span>
        </header>

        <div className="chart-body" style={{ display: "grid", placeItems: "center" }}>
          <p className="loader-text" role="status" aria-live="polite">
            Hourly temperature data is temporarily unavailable.
          </p>
        </div>
      </section>
    );
  }

  const xTicks = data.filter((_, i) => i % 3 === 0).map((d) => d.label);
  const temps = data.map((d) => d.temp).filter((value) => Number.isFinite(value));
  const currentTemp = Number.isFinite(Number(weather?.current?.temperature_2m))
    ? toDisplayTemperature(weather.current.temperature_2m, unit, weatherDataUnit)
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
  const minTemp = Math.floor(safeMinTemp - 2);
  const maxTemp = Math.ceil(safeMaxTemp + 2);
  const nowLabel = data[0]?.label;
  const chartLede = Number.isFinite(currentTemp)
    ? `Now ${currentTemp}\u00B0${unit} \u00B7 Low ${Math.round(safeMinTemp)}\u00B0 \u00B7 High ${Math.round(safeMaxTemp)}\u00B0`
    : `Range ${Math.round(safeMinTemp)}\u00B0 to ${Math.round(safeMaxTemp)}\u00B0`;

  return (
    <section
      className="bento-chart hourly-chart"
      style={style}
      aria-labelledby={chartTitleId}
      aria-describedby={chartSummaryId}
    >
      <header className="chart-header">
        <h2 id={chartTitleId} className="chart-title">
          <LineIcon size={16} />
          <span>Hourly Temperature</span>
        </h2>
        <span className="chart-subtitle">Next 24h</span>
      </header>
      <p className="chart-lede">{chartLede}</p>

      <div className="chart-body">
        <p id={chartSummaryId} className="sr-only">
          {chartSummary}
        </p>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
          <AreaChart
            data={data}
            margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
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

            <CartesianGrid
              vertical={false}
              stroke="rgba(176, 206, 255, 0.14)"
              strokeDasharray="3 6"
            />

            <XAxis
              dataKey="label"
              ticks={xTicks}
              interval={0}
              stroke="rgba(214,232,255,0.2)"
              tick={{ fontSize: 11, fill: "rgba(226,239,255,0.72)" }}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
            />

            <YAxis
              domain={[minTemp, maxTemp]}
              stroke="rgba(214,232,255,0.2)"
              tick={{ fontSize: 11, fill: "rgba(226,239,255,0.68)" }}
              axisLine={false}
              tickLine={false}
              width={34}
              tickMargin={8}
              tickFormatter={(value) => `${value}\u00B0`}
            />

            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{
                stroke: "rgba(208, 231, 255, 0.45)",
                strokeDasharray: "3 4",
              }}
            />

            {nowLabel ? (
              <ReferenceLine
                x={nowLabel}
                stroke="rgba(215, 236, 255, 0.5)"
                strokeDasharray="3 3"
                label={{
                  value: "Now",
                  position: "top",
                  fill: "rgba(235,245,255,0.85)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            ) : null}

            <Area
              type="monotone"
              dataKey="temp"
              stroke={topColor}
              strokeWidth={2.8}
              fill={`url(#${chartGradientId})`}
              dot={false}
              activeDot={{
                r: 6,
                fill: "#fff",
                stroke: topColor,
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default memo(HourlyCard);
