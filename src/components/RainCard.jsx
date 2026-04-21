// src/components/RainCard.jsx

import { memo, useMemo, useState } from "react";
import { CloudRain, Droplets, Clock } from "lucide-react";
import WeatherIcon from "./WeatherIcon";
import { useRainAnalysis } from "../hooks/useRainAnalysis";
import { formatPrecipitation, getPrecipUnitLabel } from "../utils/weatherUnits";
import { formatHour } from "../utils/dates";
import { CardHeader } from "./ui";
import "./RainCard.css";

function getRainTimelineSummary(hours, nextRain, peak, total, unit, dataUnit) {
  if (!Array.isArray(hours) || hours.length === 0) {
    return "Hourly precipitation timeline is temporarily unavailable.";
  }

  const peakTime = peak?.time instanceof Date ? formatHour(peak.time) : "later";
  const peakProbability = Number.isFinite(Number(peak?.probability))
    ? Math.round(Number(peak.probability))
    : 0;
  const projectedTotal = formatPrecipitation(total, unit, dataUnit);

  if (nextRain?.time instanceof Date) {
    return `Rain is most likely around ${formatHour(nextRain.time)}. Peak chance is ${peakProbability}% near ${peakTime}. Projected 24-hour accumulation is ${projectedTotal}.`;
  }

  return `No immediate rain onset detected. Peak chance is ${peakProbability}% near ${peakTime}. Projected 24-hour accumulation is ${projectedTotal}.`;
}

function RainCard({ weather, unit = "F", dataUnit = unit, style }) {
  const [mode, setMode] = useState("chance");
  const rainAnalysis = useRainAnalysis(weather?.hourly);
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
  const timelineSummary = useMemo(
    () => getRainTimelineSummary(hours, nextRain, peak, total, unit, dataUnit),
    [hours, nextRain, peak, total, unit, dataUnit]
  );
  const peakProbability = Number.isFinite(Number(peak?.probability))
    ? Math.round(Number(peak.probability))
    : 0;
  const rainRiskTone =
    peakProbability >= 70
      ? "high"
      : peakProbability >= 40
        ? "moderate"
        : peakProbability >= 20
          ? "low"
          : "minimal";
  const rainRiskLabel =
    rainRiskTone === "high"
      ? "High rain risk"
      : rainRiskTone === "moderate"
        ? "Moderate rain risk"
        : rainRiskTone === "low"
          ? "Low rain risk"
          : "Minimal rain risk";

  const isDry = peak.probability < 20 && total < 0.01;

  return (
    <section className="bento-rain rain-card glass" style={style}>
      <CardHeader
        headerClassName="rain-header"
        title="Rain Outlook"
        titleTag="h2"
        titleClassName="rain-title"
        icon={<CloudRain size={16} />}
        leftClassName="rain-title-wrap"
        subtitle={
          <span className={`rain-risk-badge rain-risk-badge--${rainRiskTone}`}>
            {rainRiskLabel}
          </span>
        }
      />
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

      {isDry ? (
        <div className="rain-empty">
          <div className="rain-empty-icon">
            <WeatherIcon code={0} size={44} />
          </div>
          <div className="rain-empty-title">No meaningful rain expected</div>
          <div className="rain-empty-sub">
            Highest chance is {peak.probability}% around {formatHour(peak.time)}
          </div>
        </div>
      ) : (
        <div className="rain-details">
          <div className="rain-primary">
            <div className="rain-primary-value">
              {nextRain ? formatHour(nextRain.time) : "Later today"}
            </div>
            <div className="rain-primary-label">
              {nextRain
                ? `Rain likely (${nextRain.probability}% chance)`
                : `Highest chance ${peak.probability}% around ${formatHour(peak.time)}`}
            </div>
          </div>

          <div className="rain-stats">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(soFarToday, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Observed today</div>
              </div>
            </div>
            <div className="rain-stat">
              <CloudRain size={14} />
              <div>
                <div className="rain-stat-value">
                  {formatPrecipitation(total, unit, dataUnit)}
                </div>
                <div className="rain-stat-label">Projected 24h total</div>
              </div>
            </div>
            <div className="rain-stat">
              <Clock size={14} />
              <div>
                <div className="rain-stat-value">{peak.probability}%</div>
                <div className="rain-stat-label">Peak near {formatHour(peak.time)}</div>
              </div>
            </div>
          </div>

          <div className="rain-history-heading">Recent totals</div>
          <div className="rain-history-pills" role="list" aria-label="Recent precipitation totals">
            <div className="rain-history-pill" role="listitem">
              <span className="rain-history-pill-label">12h</span>
              <span className="rain-history-pill-value">
                {formatPrecipitation(past12h, unit, dataUnit)}
              </span>
            </div>
            <div className="rain-history-pill" role="listitem">
              <span className="rain-history-pill-label">24h</span>
              <span className="rain-history-pill-value">
                {formatPrecipitation(past24h, unit, dataUnit)}
              </span>
            </div>
            <div className="rain-history-pill" role="listitem">
              <span className="rain-history-pill-label">48h</span>
              <span className="rain-history-pill-value">
                {formatPrecipitation(past48h, unit, dataUnit)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rain-timeline-wrap">
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
        <p className="rain-timeline-summary">{timelineSummary}</p>

        <div className="rain-timeline-labels">
          <span>Now</span>
          <span>+12h</span>
          <span>+24h</span>
        </div>
      </div>
    </section>
  );
}

export default memo(RainCard);
