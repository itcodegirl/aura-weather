// src/components/HourlyCard.jsx

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import "./HourlyCard.css";

function buildHourlyData(hourly, convertTemp) {
  if (!hourly?.time?.length || !hourly?.temperature_2m?.length) {
    return [];
  }

  const now = new Date();
  const startIdx = hourly.time.findIndex((t) => new Date(t) >= now);
  const idx = startIdx === -1 ? 0 : startIdx;

  return hourly.time.slice(idx, idx + 24).map((t, i) => {
    const date = new Date(t);

    return {
      time: date,
      label: date.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      }),
      temp: convertTemp(hourly.temperature_2m[idx + i]),
      code: hourly.weather_code?.[idx + i] ?? 0,
    };
  });
}

function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const info = getWeather(data.code);

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-time">{data.label}</div>
      <div className="chart-tooltip-temp">
        {data.temp}
        {"\u00B0"}
        {unit}
      </div>
      <div className="chart-tooltip-condition">{info.label}</div>
    </div>
  );
}

function HourlyCard({
  weather,
  unit,
  convertTemp,
  chartTopColor,
  chartBottomColor,
  style,
}) {
  const hourlyData = useMemo(() => buildHourlyData(weather?.hourly, convertTemp), [
    weather?.hourly,
    convertTemp,
  ]);
  const data = hourlyData;
  const palette = useMemo(() => {
    const hourlyCodes = data.map((entry) => entry.code).filter((value) => Number.isFinite(value));
    const primaryCode = hourlyCodes[0] ?? weather?.current?.weather_code ?? 0;
    return getWeather(primaryCode).gradient || ["#fbbf24", "#f59e0b", "#fbbf24"];
  }, [data, weather?.current?.weather_code]);

  const topColor = chartTopColor || palette[0];
  const bottomColor = chartBottomColor || palette[2] || palette[1];

  if (!data.length) {
    return (
      <section className="bento-chart hourly-chart" style={style}>
        <header className="chart-header">
          <div className="chart-title">
            <LineIcon size={16} />
            <span>Hourly Temperature</span>
          </div>
          <span className="chart-subtitle">Next 24 hours</span>
        </header>

      <div className="chart-body" style={{ display: "grid", placeItems: "center" }}>
          <p className="loader-text" role="status" aria-live="polite">
            Hourly outlook unavailable.
          </p>
        </div>
      </section>
    );
  }

  const xTicks = data.filter((_, i) => i % 3 === 0).map((d) => d.label);
  const temps = data.map((d) => d.temp);
  const minTemp = Math.floor(Math.min(...temps) - 2);
  const maxTemp = Math.ceil(Math.max(...temps) + 2);
  const nowLabel = data[0]?.label;

  return (
    <section className="bento-chart hourly-chart" style={style}>
      <header className="chart-header">
        <div className="chart-title">
          <LineIcon size={16} />
          <span>Hourly Temperature</span>
        </div>
        <span className="chart-subtitle">Next 24 hours</span>
      </header>

      <div className="chart-body">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
          <AreaChart
            data={data}
            margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={topColor} stopOpacity={0.7} />
                <stop
                  offset="100%"
                  stopColor={bottomColor}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              ticks={xTicks}
              interval={0}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.65)" }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              domain={[minTemp, maxTemp]}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.65)" }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(value) => `${value}\u00B0`}
            />

            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{
                stroke: "rgba(255,255,255,0.3)",
                strokeDasharray: "4 4",
              }}
            />

            <ReferenceLine
              x={nowLabel}
              stroke="rgba(255,255,255,0.4)"
              strokeDasharray="3 3"
              label={{
                value: "Now",
                position: "top",
                fill: "rgba(255,255,255,0.75)",
                fontSize: 10,
                fontWeight: 600,
              }}
            />

            <Area
              type="monotone"
              dataKey="temp"
              stroke={topColor}
              strokeWidth={2.5}
              fill="url(#tempGradient)"
              dot={false}
              activeDot={{
                r: 5,
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
