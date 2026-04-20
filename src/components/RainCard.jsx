// src/components/RainCard.jsx

import { memo, useMemo, useState } from "react";
import { CloudRain, Droplets, Clock } from "lucide-react";
import WeatherIcon from "./WeatherIcon";
import { formatPrecipitation, getPrecipUnitLabel } from "../utils/weatherUnits";
import "./RainCard.css";

function analyzeRain(hourly) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly?.precipitation_probability) ||
    !Array.isArray(hourly?.precipitation) ||
    hourly.time.length === 0
  ) {
    return {
      hours: [],
      nextRain: null,
      peak: { probability: 0, time: new Date(), amount: 0 },
      total: 0,
      soFarToday: 0,
      peakAmount: 0,
      past12h: 0,
      past24h: 0,
      past48h: 0,
    };
  }

  const hourlyTimes = hourly.time;
  const hourlyProbabilities = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const hourlyAmounts = Array.isArray(hourly.precipitation)
    ? hourly.precipitation
    : [];

  const now = new Date();
  const nowMs = now.getTime();
  const startIdx = hourlyTimes.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= nowMs;
  });
  const idx = startIdx === -1 ? 0 : startIdx;

  const hours = hourlyTimes
    .slice(idx, idx + 24)
    .map((timeString, i) => {
      const timestamp = new Date(timeString);
      if (!Number.isFinite(timestamp.getTime())) return null;

      const probability = Number(hourlyProbabilities[idx + i]);
      const amount = Number(hourlyAmounts[idx + i]);

      return {
        time: timestamp,
        probability: Number.isFinite(probability) ? probability : 0,
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter(Boolean)
    .filter((entry) => Number.isFinite(entry.time.getTime()));

  if (!hours.length) {
    return {
      hours,
      nextRain: null,
      peak: { probability: 0, time: new Date(), amount: 0 },
      total: 0,
      soFarToday: 0,
      peakAmount: 0,
      past12h: 0,
      past24h: 0,
      past48h: 0,
    };
  }

  const nextRain = hours.find((h) => h.probability >= 40);
  const peak = hours.reduce(
    (max, h) => (h.probability > max.probability ? h : max),
    hours[0]
  );
  const total = hours.reduce((sum, h) => sum + h.amount, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const todayStartIdx = hourly.time.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= todayMs;
  });
  let soFarToday = 0;
  if (todayStartIdx !== -1) {
    for (let i = todayStartIdx; i < idx; i += 1) {
      const amount = Number(hourlyAmounts[i]);
      soFarToday += Number.isFinite(amount) ? amount : 0;
    }
  }

  const peakAmount = Math.max(...hours.map((h) => h.amount));

  const sumPastHours = (hoursBack) => {
    const start = Math.max(0, idx - hoursBack);
    let sum = 0;
    for (let i = start; i < idx; i += 1) {
      const amount = Number(hourlyAmounts[i]);
      if (Number.isFinite(amount)) {
        sum += amount;
      }
    }
    return sum;
  };

  const past12h = sumPastHours(12);
  const past24h = sumPastHours(24);
  const past48h = sumPastHours(48);

  return {
    hours,
    nextRain,
    peak,
    total,
    soFarToday,
    peakAmount,
    past12h,
    past24h,
    past48h,
  };
}

function formatHour(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function RainCard({ weather, unit = "F", dataUnit = unit, style }) {
  const [mode, setMode] = useState("chance");
  const rainAnalysis = useMemo(() => analyzeRain(weather?.hourly), [weather?.hourly]);
  const {
    hours,
    nextRain,
    peak,
    total,
    soFarToday,
    peakAmount,
    past12h,
    past24h,
    past48h,
  } = rainAnalysis;

  const isDry = peak.probability < 20 && total < 0.01;

  return (
    <section className="bento-rain rain-card" style={style}>
      <header className="rain-header">
        <div className="rain-title">
          <CloudRain size={16} />
          <span>Rain Forecast</span>
        </div>
        <div className="rain-mode-toggle" role="group" aria-label="Chart mode">
          <button
            onClick={() => setMode("chance")}
            className={`rain-mode-btn ${mode === "chance" ? "is-active" : ""}`}
            aria-pressed={mode === "chance"}
          >
            %
          </button>
          <button
            onClick={() => setMode("inches")}
            className={`rain-mode-btn ${mode === "inches" ? "is-active" : ""}`}
            aria-pressed={mode === "inches"}
          >
            {unit === "C" ? "mm" : "in"}
          </button>
        </div>
      </header>

      {isDry ? (
        <div className="rain-empty">
          <div className="rain-empty-icon">
            <WeatherIcon code={0} size={44} />
          </div>
          <div className="rain-empty-title">No rain expected</div>
          <div className="rain-empty-sub">
            Peak chance just {peak.probability}% at {formatHour(peak.time)}
          </div>
        </div>
      ) : (
        <>
          <div className="rain-primary">
            <div className="rain-primary-value">
              {nextRain ? formatHour(nextRain.time) : "Later today"}
            </div>
            <div className="rain-primary-label">
              {nextRain
                ? `Rain expected (${nextRain.probability}%)`
                : `Peak ${peak.probability}% at ${formatHour(peak.time)}`}
            </div>
          </div>

          <div className="rain-stats">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(soFarToday, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">So far today</div>
              </div>
            </div>
            <div className="rain-stat">
              <CloudRain size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(total, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Next 24h total</div>
              </div>
            </div>
            <div className="rain-stat">
              <Clock size={14} />
              <div>
                <div className="rain-stat-value">{peak.probability}%</div>
                <div className="rain-stat-label">Peak {formatHour(peak.time)}</div>
              </div>
            </div>
          </div>

          <div className="rain-history-heading">Precipitation history</div>
          <div className="rain-stats rain-history-grid">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(past12h, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Past 12h</div>
              </div>
            </div>
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(past24h, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Past 24h</div>
              </div>
            </div>
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(past48h, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Past 48h</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        className="rain-timeline"
        role="img"
        aria-label={
          mode === "chance"
        ? "Hourly precipitation chance over the next 24 hours"
            : `Hourly precipitation amount in ${getPrecipUnitLabel(unit)} over the next 24 hours`
        }
      >
        {hours.map((h, i) => {
          const heightPct =
            mode === "chance"
              ? Math.max(h.probability, 3)
              : peakAmount > 0
                ? Math.max((h.amount / peakAmount) * 100, 3)
                : 3;

          const opacity =
            mode === "chance"
              ? 0.25 + (h.probability / 100) * 0.75
              : peakAmount > 0
                ? 0.25 + (h.amount / peakAmount) * 0.75
                : 0.25;

          const tooltip =
            mode === "chance"
              ? `${formatHour(h.time)} \u2014 ${h.probability}%`
            : `${formatHour(h.time)} \u2014 ${formatPrecipitation(h.amount, unit, dataUnit)}`;

          return (
            <div
              key={i}
              className="rain-bar"
              style={{ height: `${heightPct}%`, opacity }}
              title={tooltip}
            />
          );
        })}
      </div>

      <div className="rain-timeline-labels">
        <span>Now</span>
        <span>+12h</span>
        <span>+24h</span>
      </div>
    </section>
  );
}

export default memo(RainCard);
