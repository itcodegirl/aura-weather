// src/components/RainCard.jsx

import { memo, useMemo, useState } from "react";
import { CloudRain, Droplets, Clock } from "lucide-react";
import WeatherIcon from "./WeatherIcon";
import "./RainCard.css";

function analyzeRain(hourly) {
  if (!hourly?.time?.length || !hourly?.precipitation_probability?.length) {
    return {
      hours: [],
      nextRain: null,
      peak: { probability: 0, time: new Date(), amount: 0 },
      total: 0,
      soFarToday: 0,
      peakAmount: 0,
    };
  }

  const now = new Date();
  const startIdx = hourly.time.findIndex((t) => new Date(t) >= now);
  const idx = startIdx === -1 ? 0 : startIdx;

  const hours = hourly.time.slice(idx, idx + 24).map((t, i) => ({
    time: new Date(t),
    probability: hourly.precipitation_probability[idx + i] || 0,
    amount: hourly.precipitation[idx + i] || 0,
  }));

  const nextRain = hours.find((h) => h.probability >= 40);
  const peak = hours.reduce(
    (max, h) => (h.probability > max.probability ? h : max),
    hours[0]
  );
  const total = hours.reduce((sum, h) => sum + h.amount, 0);

  // How much has already fallen today (midnight → now)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStartIdx = hourly.time.findIndex((t) => new Date(t) >= today);
  let soFarToday = 0;
  if (todayStartIdx !== -1) {
    for (let i = todayStartIdx; i < idx; i++) {
      soFarToday += hourly.precipitation[i] || 0;
    }
  }

  const peakAmount = Math.max(...hours.map((h) => h.amount));

  return { hours, nextRain, peak, total, soFarToday, peakAmount };
}

function formatHour(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function RainCard({ weather }) {
  const [mode, setMode] = useState("chance");
  const rainAnalysis = useMemo(() => analyzeRain(weather?.hourly), [weather?.hourly]);
  const { hours, nextRain, peak, total, soFarToday, peakAmount } = rainAnalysis;

  const isDry = peak.probability < 20 && total < 0.01;

  return (
    <section className="bento-rain rain-card">
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
            in
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
                <div className="rain-stat-value">{soFarToday.toFixed(2)}″</div>
                <div className="rain-stat-label">So far today</div>
              </div>
            </div>
            <div className="rain-stat">
              <CloudRain size={14} />
              <div>
                <div className="rain-stat-value">{total.toFixed(2)}″</div>
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
        </>
      )}

      <div
        className="rain-timeline"
        role="img"
        aria-label={
          mode === "chance"
            ? "Hourly precipitation chance over the next 24 hours"
            : "Hourly precipitation amount in inches over the next 24 hours"
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
              ? `${formatHour(h.time)} — ${h.probability}%`
              : `${formatHour(h.time)} — ${h.amount.toFixed(2)}″`;

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
