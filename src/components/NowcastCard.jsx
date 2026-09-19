import { memo, useId, useMemo } from "react";
import { CloudRain } from "lucide-react";
import { toFiniteNumber as toStrictFiniteNumber } from "../utils/numbers";
import {
  analyzeNowcast,
  describeNowcastDuration,
  describeNowcastStart,
  NOWCAST_STEP_MINUTES,
} from "./nowcast/analyzeNowcast.js";
import { InfoDrawer } from "./ui";
import "./NowcastCard.css";
import {
  buildNowcastBarGeometry,
  NC_SVG_W,
  NC_SVG_H,
  NC_DOMAIN,
  NC_LIKELY_THRESHOLD,
} from "./nowcast/nowcastBars.js";




// Spoken equivalent of the aria-hidden chart: the threshold crossing and the
// shape of the curve, neither of which the chips (Start / Duration / Peak)
// carry. It reads the SAME clamped points the curve is drawn from, the SAME
// NC_LIKELY_THRESHOLD the dashed line uses, the SAME 15-minute cadence the
// analyzer indexes by, and the Peak chance chip's own number — so the drawn
// and spoken versions cannot disagree. With no probability points it must
// report the missing reading, not narrate a curve built from nothing.
function buildNowcastChartDescription(points, peakProbability) {
  const present = points
    .map((value, index) => ({ value, index }))
    .filter((point) => point.value !== null && point.value !== undefined);
  if (present.length < 2) {
    return "Rain chance readings for the next 2 hours are unavailable, so the chart has no curve to describe.";
  }

  const crossIndex = points.findIndex(
    (value) => value !== null && value !== undefined && value >= NC_LIKELY_THRESHOLD
  );
  const crossPhrase =
    crossIndex === -1
      ? `Rain chance stays below the ${NC_LIKELY_THRESHOLD}% rain-likely line for the next 2 hours`
      : crossIndex === 0
        ? `Rain chance is already at or above the ${NC_LIKELY_THRESHOLD}% rain-likely line now`
        : `Rain chance crosses the ${NC_LIKELY_THRESHOLD}% rain-likely line ${describeNowcastStart(crossIndex * NOWCAST_STEP_MINUTES).phrase}`;

  const half = Math.ceil(points.length / 2);
  const firstHalf = present.filter((point) => point.index < half);
  const secondHalf = present.filter((point) => point.index >= half);
  const average = (rows) => rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
  // 10 points is the smallest half-to-half swing worth calling a trend out
  // loud; below it the curve reads as level and the peak figure carries the
  // height, so no shape claim is invented from noise.
  const trend =
    firstHalf.length && secondHalf.length ? average(secondHalf) - average(firstHalf) : 0;
  const values = present.map((point) => point.value);
  const shape =
    trend >= 10
      ? "rising into the second hour"
      : trend <= -10
        ? "easing back through the second hour"
        : Math.max(...values) - Math.min(...values) <= 10
          ? "holding flat across the window"
          : "rising and falling without a clear trend";

  const peakPhrase = peakProbability === null ? "" : `, peaking at ${peakProbability}%`;
  // Gapped slots are unknown, not dry, so the spoken version says so too.
  const gapPhrase =
    present.length < points.length
      ? " Some 15-minute slots are unavailable, so the line is broken there."
      : "";

  return `${crossPhrase}${peakPhrase}, ${shape}.${gapPhrase}`;
}

function NowcastCard({
  weather,
  style,
  isRefreshing = false,
}) {
  const titleId = useId();
  const chartDescriptionId = `${titleId}-ncdesc`;
  const nowcast = useMemo(
    () => analyzeNowcast(weather?.nowcast, { timeZone: weather?.meta?.timezone }),
    [weather?.nowcast, weather?.meta?.timezone]
  );
  const {
    nowcastRiskTone,
    nowcastRiskLabel,
    startValue,
    durationValue,
    peakValue,
    peakProbability,
  } = useMemo(() => {
    const parsedPeak = toStrictFiniteNumber(nowcast.peakProbability);
    const peakProbability = parsedPeak === null ? null : Math.round(parsedPeak);
    // A dry verdict inferred only from codes/accumulation (no probability
    // reading in the window) must stay qualified at the scannable layer —
    // the badge and chip cannot claim more certainty than the details do.
    const dryUnverified =
      nowcast.hasData && !nowcast.hasRain && !nowcast.probabilityAvailable;
    const riskTone = !nowcast.hasData
      ? "missing"
      : !nowcast.hasRain
      ? dryUnverified
        ? "partial"
        : "minimal"
      : peakProbability === null
        ? "partial"
        : peakProbability >= 70
        ? "high"
        : peakProbability >= 40
          ? "moderate"
          : "low";
    /*
     * Risk-label voice ladder: stays in user vocabulary on every
     * branch. The previous "Nowcast offline" string treated the panel
     * as a system that could be online/offline — engineering talk.
     * "Reading unavailable" matches the trust contract used elsewhere
     * (HeroCard placeholder, AlertsCard unavailable state).
     */
    const riskLabel = !nowcast.hasData
      ? "Reading unavailable"
      : !nowcast.hasRain
      ? dryUnverified
        ? "Likely dry"
        : "Dry window"
      : peakProbability === null
        ? "Rain signal"
      : riskTone === "high"
        ? "High immediate risk"
        : riskTone === "moderate"
          ? "Moderate immediate risk"
          : "Low immediate risk";
    const start = nowcast.hasRain
      ? describeNowcastStart(nowcast.startInMinutes).tile
      : "\u2014";
    const duration = nowcast.hasRain
      ? describeNowcastDuration(nowcast.durationMinutes).tile
      : nowcast.hasData
        ? dryUnverified
          ? "Likely dry 2h"
          : "Dry 2h"
        : "\u2014";
    const peak =
      nowcast.hasData && peakProbability !== null
        ? `${peakProbability}%`
        : "\u2014";

    return {
      nowcastRiskTone: riskTone,
      nowcastRiskLabel: riskLabel,
      startValue: start,
      durationValue: duration,
      peakValue: peak,
      peakProbability,
    };
  }, [nowcast]);

  const chartPoints = useMemo(() => {
    // Use the now-anchored probability window from analyzeNowcast so the
    // curve matches the headline/peak (not the raw, past-shifted array).
    const series = Array.isArray(nowcast.series) ? nowcast.series : [];
    if (!nowcast.hasData || series.length < 2) return [];
    // Preserve missing slots as null so the geometry gaps the curve there
    // rather than clamping the gap to a confident 0%.
    return series.map((v) =>
      v === null || v === undefined ? null : Math.max(0, Math.min(100, v))
    );
  }, [nowcast.hasData, nowcast.series]);

  const chartTimes = useMemo(
    () => (Array.isArray(nowcast.times) ? nowcast.times : []),
    [nowcast.times]
  );
  const barGeo = useMemo(
    () => buildNowcastBarGeometry(chartPoints, chartTimes),
    [chartPoints, chartTimes]
  );
  const chartDescription = useMemo(
    () => buildNowcastChartDescription(chartPoints, peakProbability),
    [chartPoints, peakProbability]
  );

  return (
    <section
      className="bento-nowcast nowcast-card glass"
      style={style}
      aria-labelledby={titleId}
      aria-describedby={chartDescriptionId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="nowcast-header">
        <div className="nowcast-title-wrap">
          <div className="nowcast-title-row">
            <h3 id={titleId} className="nowcast-title">
              <CloudRain size={16} aria-hidden="true" />
              <span>Nowcast</span>
            </h3>
            <InfoDrawer
              label="About nowcast guidance"
              title="How to read nowcast"
              className="nowcast-help-drawer"
            >
              Nowcast reads the provider's rain-chance forecast at quarter-hour
              steps over the next 2 hours. Those steps are modelled separately in
              some regions and interpolated from hourly data in others, and the
              series is a chance of rain rather than a measurement of it — so the
              timings here are deliberately coarse. It answers whether rain is
              likely soon and roughly for how long, not what minute it starts.
            </InfoDrawer>
          </div>
          <p className="nowcast-explainer">
            Rain chance over the next 2 hours.
          </p>
        </div>
        {/* The risk word belongs on the header row, opposite the card's
            name, the way every other module states its status. It used
            to hang under the explainer on a line of its own. */}
        <span className={`severity-badge severity-badge--${nowcastRiskTone}`}>
          {nowcastRiskLabel}
        </span>
      </header>
      <div className="nowcast-primary">
        <p className="nowcast-summary">{nowcast.summary}</p>
        <p className="nowcast-details">{nowcast.details}</p>
      </div>

      {barGeo !== null && (
        <div className="nowcast-chart">
          <div className="nowcast-chart-head">
            <span className="nowcast-chart-label">Rain chance · next 2h</span>
            {peakValue !== "—" && (
              <span className="nowcast-chart-peak">peak {peakValue}</span>
            )}
          </div>
          <div className="nowcast-chart-box">
            <svg
              viewBox={`0 0 ${NC_SVG_W} ${NC_SVG_H}`}
              preserveAspectRatio="none"
              className="nowcast-svg"
              aria-hidden="true"
            >
              <line
                x1="0" y1={barGeo.thresholdY.toFixed(1)}
                x2={NC_SVG_W} y2={barGeo.thresholdY.toFixed(1)}
                stroke="var(--wire-structural)"
                strokeWidth="1"
                strokeDasharray="5 6"
                vectorEffect="non-scaling-stroke"
              />
              {/* A step the provider did not report draws nothing at all --
                  no bar, no baseline -- so a gap in the strip reads as a
                  gap and never as a dry quarter-hour.

                  The dash takes --ink-dim because it is a reading (a
                  reported 0%), not a boundary. It was
                  rgba(238,241,248,.30), which composites to 1.02 against
                  the light panel: a reported zero was invisible there and
                  so indistinguishable from a missing step, which is the
                  one distinction this strip exists to draw. */}
              {barGeo.dry.map((d, i) => (
                <line
                  key={`dry-${i}`}
                  x1={d.x.toFixed(1)} y1={barGeo.base.toFixed(1)}
                  x2={(d.x + d.width).toFixed(1)} y2={barGeo.base.toFixed(1)}
                  stroke="var(--ink-dim)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* Solid where the series carries an on-the-hour forecast
                  value; outlined where the point was interpolated between
                  two of them. An outline rather than a lighter fill so the
                  distinction survives at any background: the stroke is the
                  thing carrying the information, and it holds full contrast
                  (11.1 for the likely tone, 8.8 for the accent, against the
                  dark panel) rather than being faded under the 3:1 floor
                  WCAG 1.4.11 sets for a graphical object. */}
              {barGeo.bars.map((b, i) => {
                // One tone for every bar. Colouring the likely ones
                // green said "good" about a high chance of rain, which
                // is the opposite of what the reading means. The dashed
                // 50% rule and its "Rain likely" label carry that
                // signal, and a bar crossing the rule is the statement.
                //
                // A role, not a literal: the hard-coded #7fd99a this
                // replaces measured 1.59 against the light panel, under
                // WCAG 1.4.11's 3:1 for a graphical object, and
                // load-bearing because on an outlined bar the stroke is
                // the reading. --status-accent is 8.79 dark, 5.77 light.
                const tone = "var(--status-accent)";
                return (
                  <rect
                    key={`bar-${i}`}
                    x={b.x.toFixed(1)}
                    y={b.y.toFixed(1)}
                    width={b.width.toFixed(1)}
                    height={b.height.toFixed(1)}
                    fill={b.anchor ? tone : "none"}
                    opacity={b.anchor && !b.likely ? 0.72 : 1}
                    stroke={b.anchor ? "none" : tone}
                    strokeWidth={b.anchor ? 0 : 1.5}
                    vectorEffect={b.anchor ? undefined : "non-scaling-stroke"}
                  />
                );
              })}
            </svg>
            <span className="nowcast-chart-thresh-label" aria-hidden="true">Rain likely</span>
          </div>
          <div className="nowcast-chart-ticks" aria-hidden="true">
            <span>Now</span>
            <span>30m</span>
            <span>1h</span>
            <span>90m</span>
            <span>2h</span>
          </div>
          {/* States what the series is. Not "measured": nothing here is an
              observation -- the whole window is forecast -- and the
              distinction the outlines draw is hourly-forecast against
              interpolated. */}
          <p className="nowcast-chart-note">
            Solid bars are hourly forecast values; outlined bars are
            interpolated between them.
          </p>
        </div>
      )}

      {/*
       * Text equivalent for the aria-hidden chart (its threshold label and
       * time ticks are aria-hidden too). Rendered on every path, not only
       * with the chart, so the region's description still reports a missing
       * probability reading when there is no curve to draw.
       */}
      <p id={chartDescriptionId} className="sr-only">{chartDescription}</p>

      <ul className="nowcast-chips" aria-label="Immediate precipitation details">
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Start</span>
          <span className="nowcast-chip-value">{startValue}</span>
        </li>
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Duration</span>
          <span className="nowcast-chip-value">{durationValue}</span>
        </li>
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Peak chance</span>
          <span className="nowcast-chip-value">{peakValue}</span>
        </li>
      </ul>
      {/*
       * The trailing meta line ("Short-range precipitation guidance" /
       * "Nowcast offline") used to render here. Both copies were
       * redundant with content the user already saw: the explainer at
       * the top says "15-minute rain guidance over the next 2 hours."
       * and the badge already announces the unavailable state. Removed.
       */}
    </section>
  );
}

export default memo(NowcastCard);
