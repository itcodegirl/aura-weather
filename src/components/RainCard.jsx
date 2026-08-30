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

/*
 * One ladder for every rain-chance word this card says. 50% is the
 * app-wide "likely" cutoff — NowcastCard's NC_LIKELY_THRESHOLD and
 * HourlyCard's rainWord both draw it there, and this card draws its own
 * dashed reference line at 50%. The headline, though, used to hard-code
 * "Rain likely" for whatever hour `nextRain` resolved to, and that hour is
 * selected at probability >= 40% OR any modelled amount at all. So a 22%
 * hour was announced as "Rain likely (22% chance)" directly above this
 * card's own 50% line, while the same hour's chip read "slight chance".
 */
const RAIN_LIKELY_PROBABILITY = 50;

function describeRainChance(probability) {
  if (probability === null) return "data unavailable";
  if (probability >= RAIN_LIKELY_PROBABILITY) return "showers likely";
  if (probability >= 30) return "scattered chance";
  if (probability >= 15) return "slight chance";
  return "mostly dry";
}

function buildNextRainLabel(nextRain) {
  const probability = nextRain?.probability ?? null;
  if (probability === null) {
    return "Rain signal detected; chance unavailable";
  }
  if (probability >= RAIN_LIKELY_PROBABILITY) {
    return `Rain likely (${probability}% chance)`;
  }
  if (probability >= 30) {
    return `Scattered chance of rain (${probability}%)`;
  }
  if (probability >= 15) {
    return `Slight chance of rain (${probability}%)`;
  }
  // Reached only via the modelled-amount branch of nextRain: there is
  // precipitation in the model but the probability does not support any
  // "chance" word, so name the source instead of overstating the odds.
  return `Light rain in the forecast model (${probability}% chance)`;
}

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
  const rainAnalysis = useRainAnalysis(weather?.hourly, weather?.meta?.timezone);
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
    pastWindowCoverage,
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
    modeledTodayLabel,
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
    // Running rainfall accumulation across the window, shown as secondary
    // "total so far" context beneath each hour's own amount. (Leading with
    // the cumulative total made every hour after the rain stopped display an
    // identical plateaued value — e.g. "0.42 in" repeated for 20+ hours —
    // which read as stuck/duplicated data rather than a per-hour forecast.)
    // Summed in the source precip unit (same basis as `total`) and formatted
    // per hour. Prefix sums via slice keep this a pure render (no mutable
    // accumulator); the window is capped at 24 hours so the O(n^2) cost is
    // trivial. Null slots contribute 0 to the sum, so a prefix containing
    // one can only undercount — those totals carry an "at least" floor
    // qualifier instead of being presented as exact.
    const cumulativeTotals = hours.map((_, index) => {
      const prefix = hours.slice(0, index + 1);
      const label = formatPrecipitation(
        prefix.reduce((sum, entry) => {
          const entryAmount = toFiniteNumber(entry.amount);
          return sum + (entryAmount === null ? 0 : Math.max(entryAmount, 0));
        }, 0),
        unit,
        dataUnit
      );
      const hasGap = prefix.some(
        (entry) => toFiniteNumber(entry.amount) === null
      );
      return {
        display: hasGap ? `≥ ${label}` : label,
        announce: hasGap ? `at least ${label}` : label,
      };
    });
    const bars = hours.map((hour, index) => {
      const value = mode === "chance" ? hour.probability : hour.amount;
      const isMissing = value === null;
      const cumulative = cumulativeTotals[index];
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
      // The sample strip and its readout are the "rain tracker": in amount
      // mode each chip leads with that hour's own precipitation, with the
      // running accumulation ("total so far") as the secondary line. This
      // keeps every hour distinct — leading with the cumulative total made
      // all the post-rain hours show one identical plateaued value. The
      // chart bars above stay per-hour intensity (tooltip/valueLabel too).
      const trackValueLabel = valueLabel;
      const chanceMeta = describeRainChance(prob);
      const trackMeta = isMissing
        ? "data unavailable"
        : mode === "chance"
          ? chanceMeta
          : `${cumulative.display} total so far`;
      const sampleAnnounce = isMissing
        ? `${timeLabel} — data unavailable`
        : mode === "chance"
          ? `${timeLabel} — ${hour.probability}%`
          : `${timeLabel} — ${valueLabel} this hour, ${cumulative.announce} total so far`;

      return {
        key: Number.isFinite(hour.time?.getTime?.())
          ? String(hour.time.getTime())
          : tooltip,
        heightPct,
        opacity,
        tooltip,
        timeLabel,
        trackValueLabel,
        trackMeta,
        sampleAnnounce,
        isMissing,
        tier,
        isPeak,
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
      modeledTodayLabel: formatPrecipitation(soFarToday, unit, dataUnit),
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

  // Roving-tabindex navigation shared by the chart bars and the sample strip,
  // so each set of ~24 hour buttons is a single tab stop (arrow keys move
  // within) instead of ~24 separate ones. querySelector is scoped to
  // event.currentTarget, so one handler drives whichever group fired it.
  const onBarsKeyDown = (event) => {
    const keys = timelineBars.map((bar) => bar.key);
    const activeKey =
      event.target instanceof HTMLElement ? event.target.dataset.barKey : null;
    const active = Math.max(0, keys.indexOf(activeKey));
    let next = null;
    if (event.key === "ArrowRight") next = Math.min(keys.length - 1, active + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = keys.length - 1;
    if (next === null) return;
    event.preventDefault();
    setSelectedSampleKey(keys[next]);
    event.currentTarget
      .querySelector(`[data-bar-key="${keys[next]}"]`)
      ?.focus();
  };

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
            The rest of the forecast is still live, but precipitation readings
            did not come through. Refresh to try again.
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
                ? buildNextRainLabel(nextRain)
                : `Highest chance ${peakProbabilityLabel} around ${peakTimeLabel}`}
            </div>
          </div>

          <div className="rain-stats">
            <div className="rain-stat">
              <Droplets size={14} />
              <div>
                {/* "Modeled", not "Observed": past slots come from the
                    forecast provider's model/analysis series, not a rain
                    gauge, and the label must not overclaim provenance. */}
                <div className="rain-stat-value rain-stat-value--modeled">
                  {modeledTodayLabel}
                </div>
                <div className="rain-stat-label">Modeled so far today</div>
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
            {/* A window served by fewer past slots than it names (the
                series can arrive short) would silently repeat a smaller
                window's sum, so short pills disclose their real span. */}
            {[
              { label: "12h", window: 12, value: past12hLabel, coverage: pastWindowCoverage.h12 },
              { label: "24h", window: 24, value: past24hLabel, coverage: pastWindowCoverage.h24 },
              { label: "48h", window: 48, value: past48hLabel, coverage: pastWindowCoverage.h48 },
            ].map((pill) => (
              <li key={pill.label} className="rain-history-pill">
                <span className="rain-history-pill-label">{pill.label}</span>
                <span className="rain-history-pill-value">
                  {pill.value}
                </span>
                {pill.coverage < pill.window ? (
                  <span className="rain-history-pill-note">
                    {pill.coverage}h of data
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rain-timeline-wrap">
        <div
          className="rain-timeline"
          role="group"
          onKeyDown={onBarsKeyDown}
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
              data-bar-key={bar.key}
              tabIndex={bar.key === selectedSample?.key ? 0 : -1}
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
            <strong className="rain-detail-value">{selectedSample.trackValueLabel}</strong>
            <span className="rain-detail-meta">{selectedSample.trackMeta}</span>
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
                <strong>{selectedSample.trackValueLabel}</strong>
                <span>
                  {mode === "chance"
                    ? "Rain confidence"
                    : selectedSample.trackMeta}
                </span>
              </p>
            ) : null}
            <div
              className="rain-touch-strip"
              role="group"
              onKeyDown={onBarsKeyDown}
              aria-label="Hourly rain samples"
            >
              {timelineBars.map((bar) => {
                const isUserSelection = selectedSampleKey === bar.key;
                const isShown = selectedSample?.key === bar.key;
                return (
                  <button
                    key={`sample-${bar.key}`}
                    type="button"
                    data-bar-key={bar.key}
                    tabIndex={bar.key === selectedSample?.key ? 0 : -1}
                    className={`rain-touch-sample ${isShown ? "is-selected" : ""}`.trim()}
                    aria-current={isUserSelection ? "true" : undefined}
                    aria-label={`Show ${bar.sampleAnnounce}`}
                    onClick={() => setSelectedSampleKey(bar.key)}
                  >
                    <span>{bar.timeLabel}</span>
                    <strong>{bar.trackValueLabel}</strong>
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
