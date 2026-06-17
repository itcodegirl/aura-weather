import { memo, useId, useMemo } from "react";
import { CloudRain } from "lucide-react";
import { toFiniteNumber as toStrictFiniteNumber } from "../utils/numbers";
import { analyzeNowcast } from "./nowcast/analyzeNowcast.js";
import { InfoDrawer } from "./ui";
import "./NowcastCard.css";

const NC_SVG_W = 1000;
const NC_SVG_H = 150;
const NC_TOP_PAD = 20;
const NC_BOT_PAD = 24;
const NC_DOMAIN = 50;

function buildNowcastChartGeometry(points) {
  const n = points.length;
  if (n < 2) return null;
  const span = NC_SVG_H - NC_TOP_PAD - NC_BOT_PAD;
  const xs = points.map((_, i) => (i / (n - 1)) * NC_SVG_W);
  const ys = points.map(v => NC_TOP_PAD + (1 - Math.min(v, NC_DOMAIN) / NC_DOMAIN) * span);
  let core = "";
  for (let i = 0; i < n - 1; i++) {
    const xc = (xs[i] + xs[i + 1]) / 2;
    const yc = (ys[i] + ys[i + 1]) / 2;
    core += ` Q${xs[i].toFixed(1)},${ys[i].toFixed(1)} ${xc.toFixed(1)},${yc.toFixed(1)}`;
  }
  core += ` L${xs[n - 1].toFixed(1)},${ys[n - 1].toFixed(1)}`;
  const strokeD = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}${core}`;
  const fillD = `${strokeD} L${NC_SVG_W},${NC_SVG_H} L0,${NC_SVG_H} Z`;
  const thresholdY = NC_TOP_PAD + (1 - 40 / NC_DOMAIN) * span;
  const peakIdx = points.indexOf(Math.max(...points));
  return { strokeD, fillD, thresholdY, xs, ys, peakIdx };
}

function NowcastCard({
  weather,
  style,
  isRefreshing = false,
}) {
  const titleId = useId();
  const chartGradientId = `${titleId}-ncg`;
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
  } = useMemo(() => {
    const parsedPeak = toStrictFiniteNumber(nowcast.peakProbability);
    const peakProbability = parsedPeak === null ? null : Math.round(parsedPeak);
    const riskTone = !nowcast.hasData
      ? "missing"
      : !nowcast.hasRain
      ? "minimal"
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
      ? "Dry window"
      : peakProbability === null
        ? "Rain signal"
      : riskTone === "high"
        ? "High immediate risk"
        : riskTone === "moderate"
          ? "Moderate immediate risk"
          : "Low immediate risk";
    const start = nowcast.hasRain
      ? nowcast.startInMinutes === 0
        ? "Now"
        : `${nowcast.startInMinutes} min`
      : "\u2014";
    const duration = nowcast.hasRain
      ? `${Math.max(0, Math.round(nowcast.durationMinutes))} min`
      : nowcast.hasData
        ? "Dry 2h"
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
    };
  }, [nowcast]);

  const chartPoints = useMemo(() => {
    // Use the now-anchored probability window from analyzeNowcast so the
    // curve matches the headline/peak (not the raw, past-shifted array).
    const series = Array.isArray(nowcast.series) ? nowcast.series : [];
    if (!nowcast.hasData || series.length < 2) return [];
    return series.map((v) => Math.max(0, Math.min(100, v)));
  }, [nowcast.hasData, nowcast.series]);

  const chartGeo = useMemo(() => buildNowcastChartGeometry(chartPoints), [chartPoints]);

  return (
    <section
      className="bento-nowcast nowcast-card glass"
      style={style}
      aria-labelledby={titleId}
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
              Nowcast is short-range guidance built from 15-minute weather points. It estimates start time, likely duration, and peak rain chance over the next 2 hours.
            </InfoDrawer>
          </div>
          <p className="nowcast-explainer">
            15-minute rain guidance over the next 2 hours.
          </p>
          <span className={`severity-badge severity-badge--${nowcastRiskTone}`}>
            {nowcastRiskLabel}
          </span>
        </div>
      </header>
      <div className="nowcast-primary">
        <p className="nowcast-summary">{nowcast.summary}</p>
        <p className="nowcast-details">{nowcast.details}</p>
      </div>

      {chartGeo !== null && (
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
              <defs>
                <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7fd99a" stopOpacity="0.34" />
                  <stop offset="55%" stopColor="#7fd99a" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#7fd99a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line
                x1="0" y1={chartGeo.thresholdY.toFixed(1)}
                x2={NC_SVG_W} y2={chartGeo.thresholdY.toFixed(1)}
                stroke="rgba(238,241,248,.22)"
                strokeWidth="1"
                strokeDasharray="5 6"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1="0" y1={NC_SVG_H - 1}
                x2={NC_SVG_W} y2={NC_SVG_H - 1}
                stroke="rgba(255,255,255,.08)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <path d={chartGeo.fillD} fill={`url(#${chartGradientId})`} />
              <path
                d={chartGeo.strokeD}
                fill="none"
                stroke="#7fd99a"
                strokeOpacity="0.22"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={chartGeo.strokeD}
                fill="none"
                stroke="#7fd99a"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={chartGeo.xs[chartGeo.peakIdx].toFixed(1)}
                cy={chartGeo.ys[chartGeo.peakIdx].toFixed(1)}
                r="3.2"
                fill="#0b1626"
                stroke="#7fd99a"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
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
        </div>
      )}

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
