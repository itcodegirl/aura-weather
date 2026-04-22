// src/components/RainCard.jsx

import { memo, useId, useMemo, useState } from "react";
import { CloudRain, Droplets, Clock } from "lucide-react";
import WeatherIcon from "./WeatherIcon";
import { useRainAnalysis } from "../hooks/useRainAnalysis";
import { formatPrecipitation, getPrecipUnitLabel } from "../utils/weatherUnits";
import { formatHour } from "../utils/dates";
import { CardHeader, DataTrustMeta } from "./ui";
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

function RainCard({
  weather,
  unit = "F",
  dataUnit = unit,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const timelineId = useId();
  const timelineSummaryId = `${timelineId}-summary`;
  const timelineDetailsId = `${timelineId}-details`;
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
  const {
    isDry,
    peakProbability,
    peakTimeLabel,
    nextRainTimeLabel,
    rainRiskTone,
    rainRiskLabel,
    observedTodayLabel,
    projectedTotalLabel,
    past12hLabel,
    past24hLabel,
    past48hLabel,
    timelineBars,
    timelineAccessibleText,
  } = useMemo(() => {
    const safePeakProbability = Number.isFinite(Number(peak?.probability))
      ? Math.round(Number(peak.probability))
      : 0;

    const safeRiskTone =
      safePeakProbability >= 70
        ? "high"
        : safePeakProbability >= 40
          ? "moderate"
          : safePeakProbability >= 20
            ? "low"
            : "minimal";

    const safeRiskLabel =
      safeRiskTone === "high"
        ? "High rain risk"
        : safeRiskTone === "moderate"
          ? "Moderate rain risk"
          : safeRiskTone === "low"
            ? "Low rain risk"
            : "Minimal rain risk";

    const safePeakTimeLabel = formatHour(peak?.time);
    const safeNextRainTimeLabel = nextRain ? formatHour(nextRain.time) : "";
    const safePeakAmount = Number.isFinite(Number(peakAmount))
      ? Number(peakAmount)
      : 0;
    const bars = hours.map((hour) => {
      const heightPct =
        mode === "chance"
          ? Math.max(hour.probability, 3)
          : safePeakAmount > 0
            ? Math.max((hour.amount / safePeakAmount) * 100, 3)
            : 3;

      const opacity =
        mode === "chance"
          ? 0.25 + (hour.probability / 100) * 0.75
          : safePeakAmount > 0
            ? 0.25 + (hour.amount / safePeakAmount) * 0.75
            : 0.25;

      const tooltip =
        mode === "chance"
          ? `${formatHour(hour.time)} \u2014 ${hour.probability}%`
          : `${formatHour(hour.time)} \u2014 ${formatPrecipitation(hour.amount, unit, dataUnit)}`;

      return {
        key: Number.isFinite(hour.time?.getTime?.())
          ? String(hour.time.getTime())
          : tooltip,
        heightPct,
        opacity,
        tooltip,
      };
    });
    const accessibleText = bars.length
      ? bars.map((bar) => bar.tooltip).join(". ")
      : "Hourly precipitation timeline is temporarily unavailable.";

    return {
      isDry: safePeakProbability < 20 && total < 0.01,
      peakProbability: safePeakProbability,
      peakTimeLabel: safePeakTimeLabel,
      nextRainTimeLabel: safeNextRainTimeLabel,
      rainRiskTone: safeRiskTone,
      rainRiskLabel: safeRiskLabel,
      observedTodayLabel: formatPrecipitation(soFarToday, unit, dataUnit),
      projectedTotalLabel: formatPrecipitation(total, unit, dataUnit),
      past12hLabel: formatPrecipitation(past12h, unit, dataUnit),
      past24hLabel: formatPrecipitation(past24h, unit, dataUnit),
      past48hLabel: formatPrecipitation(past48h, unit, dataUnit),
      timelineBars: bars,
      timelineAccessibleText: accessibleText,
    };
  }, [
    peak,
    nextRain,
    peakAmount,
    hours,
    mode,
    total,
    soFarToday,
    past12h,
    past24h,
    past48h,
    unit,
    dataUnit,
  ]);

  return (
    <section
      className="bento-rain rain-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <CardHeader
        headerClassName="rain-header"
        title="Rain Outlook"
        titleTag="h3"
        titleClassName="rain-title"
        icon={<CloudRain size={16} />}
        leftClassName="rain-title-wrap"
        subtitle={
          <span className={`rain-risk-badge rain-risk-badge--${rainRiskTone}`}>
            {rainRiskLabel}
          </span>
        }
      />
      <DataTrustMeta
        sourceLabel="Open-Meteo Forecast"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />
      <div className="rain-mode-toggle" role="group" aria-label="Chart mode">
          <button
            onClick={() => setMode("chance")}
            className={`rain-mode-btn ${mode === "chance" ? "is-active" : ""}`}
            aria-pressed={mode === "chance"}
            aria-label="Show hourly rain chance"
          >
            %
          </button>
          <button
            onClick={() => setMode("inches")}
            className={`rain-mode-btn ${mode === "inches" ? "is-active" : ""}`}
            aria-pressed={mode === "inches"}
            aria-label="Show hourly rain accumulation"
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
            Highest chance is {peakProbability}% around {peakTimeLabel}
        </div>
      </div>
      ) : (
        <div className="rain-details">
          <div className="rain-primary">
            <div className="rain-primary-value">
              {nextRain ? nextRainTimeLabel : "Later today"}
            </div>
            <div className="rain-primary-label">
              {nextRain
                ? `Rain likely (${nextRain.probability}% chance)`
                : `Highest chance ${peakProbability}% around ${peakTimeLabel}`}
            </div>
          </div>

          <div className="rain-stats">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value">
                  {observedTodayLabel}
                </div>
                <div className="rain-stat-label">Observed today</div>
              </div>
            </div>
            <div className="rain-stat">
              <CloudRain size={14} />
              <div>
                <div className="rain-stat-value">
                  {projectedTotalLabel}
                </div>
                <div className="rain-stat-label">Projected 24h total</div>
              </div>
            </div>
            <div className="rain-stat">
              <Clock size={14} />
              <div>
                <div className="rain-stat-value">{peakProbability}%</div>
                <div className="rain-stat-label">Peak near {peakTimeLabel}</div>
              </div>
            </div>
          </div>

          <div className="rain-history-heading">Recent totals</div>
          <ul className="rain-history-pills" aria-label="Recent precipitation totals">
            <li className="rain-history-pill">
              <span className="rain-history-pill-label">12h</span>
              <span className="rain-history-pill-value">
                {past12hLabel}
              </span>
            </li>
            <li className="rain-history-pill">
              <span className="rain-history-pill-label">24h</span>
              <span className="rain-history-pill-value">
                {past24hLabel}
              </span>
            </li>
            <li className="rain-history-pill">
              <span className="rain-history-pill-label">48h</span>
              <span className="rain-history-pill-value">
                {past48hLabel}
              </span>
            </li>
          </ul>
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
          aria-describedby={`${timelineSummaryId} ${timelineDetailsId}`}
        >
          {timelineBars.map((bar) => (
            <div
              key={bar.key}
              className="rain-bar"
              style={{ height: `${bar.heightPct}%`, opacity: bar.opacity }}
              title={bar.tooltip}
              aria-hidden="true"
            />
          ))}
        </div>
        <p id={timelineSummaryId} className="rain-timeline-summary">{timelineSummary}</p>
        <p id={timelineDetailsId} className="sr-only">{timelineAccessibleText}</p>

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
