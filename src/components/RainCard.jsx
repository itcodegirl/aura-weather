// src/components/RainCard.jsx

import { memo, useId, useMemo, useState } from "react";
import { CloudRain, Droplets, Clock } from "lucide-react";
import WeatherIcon from "./WeatherIcon";
import { useRainAnalysis } from "../hooks/useRainAnalysis";
import { formatPrecipitation, getPrecipUnitLabel } from "../utils/weatherUnits";
import { formatHour } from "../utils/dates";
import { toFiniteNumber } from "../utils/numbers";
import { CardHeader } from "./ui";
import "./RainCard.css";

const MISSING_PLACEHOLDER = "\u2014";

function getRainTimelineSummary(hours, nextRain, peak, total, unit, dataUnit) {
  if (!Array.isArray(hours) || hours.length === 0) {
    return "Hourly precipitation isn't available right now. Other forecast panels are still live.";
  }

  const peakTime = peak?.time instanceof Date ? formatHour(peak.time) : "later";
  const parsedPeakProbability = toFiniteNumber(peak?.probability);
  const peakProbability =
    parsedPeakProbability === null
      ? "unavailable"
      : `${Math.round(parsedPeakProbability)}%`;
  const projectedTotal = formatPrecipitation(total, unit, dataUnit);
  const missingSlots = hours.filter((hour) => hour?.missing).length;
  const missingNote =
    missingSlots > 0
      ? ` ${missingSlots} precipitation slot${missingSlots === 1 ? "" : "s"} unavailable.`
      : "";

  if (parsedPeakProbability === null && projectedTotal === MISSING_PLACEHOLDER) {
    return `Not enough precipitation samples to summarise the next 24 hours.${missingNote}`;
  }

  if (nextRain?.time instanceof Date) {
    return `Rain signal appears around ${formatHour(nextRain.time)}. Peak chance is ${peakProbability} near ${peakTime}. Projected 24-hour accumulation is ${projectedTotal}.${missingNote}`;
  }

  return `No immediate rain onset detected. Peak chance is ${peakProbability} near ${peakTime}. Projected 24-hour accumulation is ${projectedTotal}.${missingNote}`;
}

function RainCard({
  weather,
  unit = "F",
  dataUnit = unit,
  style,
  isRefreshing = false,
}) {
  const timelineId = useId();
  const titleId = `${timelineId}-title`;
  const timelineSummaryId = `${timelineId}-summary`;
  const timelineDetailsId = `${timelineId}-details`;
  const [mode, setMode] = useState("chance");
  const [selectedSampleKey, setSelectedSampleKey] = useState(null);
  const rainAnalysis = useRainAnalysis(weather?.hourly);
  const {
    hasData,
    hours,
    nextRain,
    peak,
    total,
    soFarToday,
    peakAmount,
    past12h,
    past24h,
    past48h,
    missingSlots,
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
    const parsedPeakProbability = toFiniteNumber(peak?.probability);
    const safePeakProbability =
      parsedPeakProbability === null ? null : Math.round(parsedPeakProbability);
    const safeTotal = toFiniteNumber(total);
    let safeRiskTone = "minimal";

    if (!hasData) {
      safeRiskTone = "missing";
    } else if (safePeakProbability === null) {
      safeRiskTone = "partial";
    } else if (safePeakProbability >= 70) {
      safeRiskTone = "high";
    } else if (safePeakProbability >= 40) {
      safeRiskTone = "moderate";
    } else if (safePeakProbability >= 20) {
      safeRiskTone = "low";
    }

    const safeRiskLabel =
      safeRiskTone === "missing"
        ? "Rain data offline"
        : safeRiskTone === "partial"
          ? "Partial rain data"
          : safeRiskTone === "high"
            ? "High rain risk"
            : safeRiskTone === "moderate"
              ? "Moderate rain risk"
              : safeRiskTone === "low"
                ? "Low rain risk"
                : "Minimal rain risk";

    const safePeakTimeLabel = formatHour(peak?.time);
    const safeNextRainTimeLabel = nextRain ? formatHour(nextRain.time) : "";
    const safePeakAmount = toFiniteNumber(peakAmount);
    const bars = hours.map((hour) => {
      const value = mode === "chance" ? hour.probability : hour.amount;
      const isMissing = value === null;
      const heightPct =
        isMissing
          ? 14
          : mode === "chance"
            ? Math.max(hour.probability, 3)
            : safePeakAmount > 0
              ? Math.max((hour.amount / safePeakAmount) * 100, 3)
              : 3;

      const opacity =
        isMissing
          ? 0.45
          : mode === "chance"
          ? 0.25 + (hour.probability / 100) * 0.75
          : safePeakAmount > 0
            ? 0.25 + (hour.amount / safePeakAmount) * 0.75
            : 0.25;

      const tooltip =
        isMissing
          ? `${formatHour(hour.time)} \u2014 data unavailable`
          : mode === "chance"
          ? `${formatHour(hour.time)} \u2014 ${hour.probability}%`
          : `${formatHour(hour.time)} \u2014 ${formatPrecipitation(hour.amount, unit, dataUnit)}`;
      const valueLabel =
        isMissing
          ? MISSING_PLACEHOLDER
          : mode === "chance"
            ? `${hour.probability}%`
            : formatPrecipitation(hour.amount, unit, dataUnit);
      const timeLabel = formatHour(hour.time);
      const prob = isMissing ? null : hour.probability;
      const tier = isMissing
        ? "na"
        : mode === "chance"
          ? prob >= 50 ? "hi" : prob >= 30 ? "mid" : "lo"
          : safePeakAmount > 0
            ? hour.amount >= safePeakAmount * 0.66
              ? "hi"
              : hour.amount >= safePeakAmount * 0.33
                ? "mid"
                : "lo"
            : "lo";
      const isPeak =
        peak?.time instanceof Date &&
        hour.time instanceof Date &&
        hour.time.getTime() === peak.time.getTime();
      const meta = isMissing
        ? "data unavailable"
        : mode === "chance"
          ? prob >= 50
            ? "showers likely"
            : prob >= 30
              ? "scattered chance"
              : prob >= 15
                ? "slight chance"
                : "mostly dry"
          : "projected amount";

      return {
        key: Number.isFinite(hour.time?.getTime?.())
          ? String(hour.time.getTime())
          : tooltip,
        heightPct,
        opacity,
        tooltip,
        valueLabel,
        timeLabel,
        isMissing,
        tier,
        isPeak,
        meta,
      };
    });
    const accessibleText = bars.length
      ? bars.map((bar) => bar.tooltip).join(". ")
      : "Hourly precipitation isn't available right now. Other forecast panels are still live.";

    return {
      isDry:
        hasData &&
        safePeakProbability !== null &&
        safePeakProbability < 20 &&
        safeTotal !== null &&
        safeTotal < 0.01,
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
    hasData,
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

  const peakProbabilityLabel =
    peakProbability === null ? MISSING_PLACEHOLDER : `${peakProbability}%`;
  const selectedSample =
    timelineBars.find((bar) => bar.key === selectedSampleKey) ||
    timelineBars[0] ||
    null;

  return (
    <section
      className="bento-rain rain-card glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <CardHeader
        headerClassName="rain-header"
        title="Rain Outlook"
        titleId={titleId}
        titleTag="h3"
        titleClassName="rain-title"
        icon={<CloudRain size={16} />}
        leftClassName="rain-title-wrap"
        subtitle={
          <span className={`severity-badge severity-badge--${rainRiskTone}`}>
            {rainRiskLabel}
          </span>
        }
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

      {!hasData ? (
        <div className="card-empty" role="status">
          <div className="card-empty__icon">
            <CloudRain size={36} aria-hidden="true" />
          </div>
          <p className="card-empty__title">Rain guidance unavailable</p>
          <p className="card-empty__copy">
            Precipitation readings are unavailable right now.
          </p>
        </div>
      ) : isDry ? (
        <div className="card-empty" role="status">
          <div className="card-empty__icon">
            <WeatherIcon code={0} size={36} />
          </div>
          <p className="card-empty__title">No meaningful rain expected</p>
          <p className="card-empty__copy">
            Highest chance is {peakProbability}% around {peakTimeLabel}
          </p>
        </div>
      ) : (
        <div className="rain-details">
          <div className="rain-primary">
            <div className="rain-primary-value">
              {nextRain ? nextRainTimeLabel : "Later today"}
            </div>
            <div className="rain-primary-label">
              {nextRain
                ? nextRain.probability === null
                  ? "Rain signal detected; chance unavailable"
                  : `Rain likely (${nextRain.probability}% chance)`
                : `Highest chance ${peakProbabilityLabel} around ${peakTimeLabel}`}
            </div>
          </div>

          <div className="rain-stats">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                <div className="rain-stat-value rain-stat-value--observed">
                  {observedTodayLabel}
                </div>
                <div className="rain-stat-label">Observed today</div>
              </div>
            </div>
            <div className="rain-stat">
              <CloudRain size={14} />
              <div>
                <div className="rain-stat-value rain-stat-value--projected">
                  {projectedTotalLabel}
                </div>
                <div className="rain-stat-label">Projected 24h total</div>
              </div>
            </div>
            <div className="rain-stat">
              <Clock size={14} />
              <div>
                <div className={`rain-stat-value rain-stat-value--peak${peakProbability === null ? " is-missing" : ""}`}>
                  {peakProbabilityLabel}
                </div>
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
          role="group"
          aria-label={
            mode === "chance"
              ? "Hourly rain chance over the next 24 hours \u2014 tap an hour to inspect"
              : `Hourly rain amount in ${getPrecipUnitLabel(unit)} over the next 24 hours \u2014 tap an hour to inspect`
          }
          aria-describedby={`${timelineSummaryId} ${timelineDetailsId}`}
        >
          {mode === "chance" ? (
            <div className="rain-thresh" aria-hidden="true">
              <span>50%</span>
            </div>
          ) : null}
          {timelineBars.map((bar) => (
            <button
              type="button"
              key={bar.key}
              className={`rain-bar${selectedSample?.key === bar.key ? " is-sel" : ""}`}
              title={bar.tooltip}
              aria-label={`Select ${bar.tooltip}`}
              onClick={() => setSelectedSampleKey(bar.key)}
            >
              <span
                className={`rain-bar-fill b-${bar.tier}${bar.isMissing ? " rain-bar--missing" : ""}${bar.isPeak ? " is-peak" : ""}`}
                style={{ height: `${bar.heightPct}%` }}
              />
            </button>
          ))}
        </div>
        {selectedSample ? (
          <p className="rain-detail">
            <span className="rain-detail-time">{selectedSample.timeLabel}</span>
            <strong className="rain-detail-value">{selectedSample.valueLabel}</strong>
            <span className="rain-detail-meta">{selectedSample.meta}</span>
          </p>
        ) : null}
        <p id={timelineSummaryId} className="rain-timeline-summary">{timelineSummary}</p>
        {hasData && missingSlots > 0 ? (
          <p className="rain-missing-note" role="status">
            Some precipitation slots are unavailable from the provider.
          </p>
        ) : null}
        <p id={timelineDetailsId} className="sr-only">{timelineAccessibleText}</p>

        <div className="rain-timeline-labels">
          <span>Now</span>
          <span>+12h</span>
          <span>+24h</span>
        </div>

        {timelineBars.length ? (
          <div className="rain-touch-explorer" aria-label="Rain samples">
            {/*
             * Same announcement-quality fix as the HourlyCard touch
             * explorer: drop aria-live from this paragraph (the button
             * activation already announces the change via its own
             * aria-label + aria-current toggle), and use aria-current
             * rather than aria-pressed since the user is showing a
             * sample, not toggling a state on. aria-current only fires
             * after the user has actually tapped a sample.
             */}
            {selectedSample ? (
              <p className="rain-selected-sample">
                <span>{selectedSample.timeLabel}</span>
                <strong>{selectedSample.valueLabel}</strong>
                <span>{mode === "chance" ? "Rain confidence" : "Rain amount"}</span>
              </p>
            ) : null}
            <div className="rain-touch-strip" role="list" aria-label="Hourly rain samples">
              {timelineBars.map((bar) => {
                const isUserSelection = selectedSampleKey === bar.key;
                const isShown = selectedSample?.key === bar.key;
                return (
                  <button
                    key={`sample-${bar.key}`}
                    type="button"
                    className={`rain-touch-sample ${isShown ? "is-selected" : ""}`.trim()}
                    aria-current={isUserSelection ? "true" : undefined}
                    aria-label={`Show ${bar.tooltip}`}
                    onClick={() => setSelectedSampleKey(bar.key)}
                  >
                    <span>{bar.timeLabel}</span>
                    <strong>{bar.valueLabel}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default memo(RainCard);
