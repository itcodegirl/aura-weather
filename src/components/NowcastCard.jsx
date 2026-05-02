import { memo, useMemo } from "react";
import { CloudRain } from "lucide-react";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/missingData";
import { DataTrustMeta, InfoDrawer } from "./ui";
import "./NowcastCard.css";

const RAIN_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const NOWCAST_STEP_MINUTES = 15;
const NOWCAST_WINDOW_SIZE = 8; // next 2 hours with 15-min resolution

function clampProbability(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return Number.isFinite(clamped) ? clamped : 0;
}

function analyzeNowcast(nowcast) {
  if (
    !Array.isArray(nowcast?.time) ||
    nowcast.time.length === 0
  ) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: 0,
      peakProbability: 0,
      summary: "Nowcast data is unavailable.",
      details: "15-minute precipitation data is temporarily unavailable.",
    };
  }

  const { time } = nowcast;
  const precipitationProbabilitySeries = Array.isArray(nowcast?.rainChance)
    ? nowcast.rainChance
    : [];
  const precipitationSeries = Array.isArray(nowcast?.rainAmount)
    ? nowcast.rainAmount
    : [];
  const weatherCodeSeries = Array.isArray(nowcast?.conditionCode)
    ? nowcast.conditionCode
    : [];

  const normalizedStartIdx = findWindowStartIndex(time, {
    windowSize: NOWCAST_WINDOW_SIZE,
  });

  if (normalizedStartIdx < 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: 0,
      peakProbability: 0,
      summary: "No minute-by-minute points are available.",
      details: "The next 2-hour nowcast window returned no valid data points.",
    };
  }

  const rows = time
    .slice(normalizedStartIdx, normalizedStartIdx + NOWCAST_WINDOW_SIZE)
    .map((timeValue, i) => {
      if (timeValue && !Number.isFinite(new Date(timeValue).getTime())) {
        return null;
      }

      const idx = normalizedStartIdx + i;
      const probability = clampProbability(toFiniteNumber(precipitationProbabilitySeries[idx], 0));
      const rainAmount = Math.max(toFiniteNumber(precipitationSeries[idx], 0), 0);
      const code = toFiniteNumber(weatherCodeSeries[idx], 0);
      const isWet =
        probability >= 25 ||
        rainAmount > 0 ||
        RAIN_WEATHER_CODES.has(code);
      return {
        probability,
        rainAmount,
        isWet,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: 0,
      peakProbability: 0,
      summary: "No minute-by-minute points are available.",
      details: "The next 2-hour nowcast window returned no valid data points.",
    };
  }

  const firstWetIndex = rows.findIndex((row) => row.isWet);
  if (firstWetIndex === -1) {
    const peakProbability = rows.length
      ? rows.reduce((max, row) => Math.max(max, row.probability), 0)
      : 0;
    return {
      hasData: true,
      hasRain: false,
      startInMinutes: 0,
      durationMinutes: 0,
      peakProbability,
      summary: "Dry for the next 2 hours.",
      details: `Peak rain chance stays below ${peakProbability}% in the near term.`,
    };
  }

  let endWetIndex = firstWetIndex;
  for (let i = firstWetIndex + 1; i < rows.length; i += 1) {
    if (!rows[i].isWet) {
      break;
    }
    endWetIndex = i;
  }

  const windowRows = rows.slice(firstWetIndex, endWetIndex + 1);
  const peakProbability = clampProbability(
    Math.max(...windowRows.map((row) => row.probability), 0)
  );
  const startInMinutes = Math.max(firstWetIndex * NOWCAST_STEP_MINUTES, 0);
  const durationMinutes = Math.max(windowRows.length * NOWCAST_STEP_MINUTES, NOWCAST_STEP_MINUTES);
  const intensity =
    peakProbability >= 65 ? "Heavy" : peakProbability >= 35 ? "Moderate" : "Light";
  const startMinutesText =
    startInMinutes === 0
      ? "now"
      : `${startInMinutes} minute${startInMinutes === 1 ? "" : "s"}`;
  const startPhrase =
    startInMinutes === 0 ? "starting now" : `starting in ${startMinutesText}`;
  const summary = `${intensity} rain ${startPhrase}, lasting ~${durationMinutes} minutes`;
  const averageProbability = Math.round(
    windowRows.length
      ? windowRows.reduce((sum, row) => sum + row.probability, 0) / windowRows.length
      : 0
  );

  return {
    hasData: true,
    hasRain: true,
    startInMinutes,
    durationMinutes,
    peakProbability,
    averageProbability,
    summary,
    details: `Peak chance ${Math.round(peakProbability)}% (${averageProbability}% average).`,
  };
}

function NowcastCard({
  weather,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const nowcast = useMemo(() => analyzeNowcast(weather?.nowcast), [weather?.nowcast]);
  const {
    nowcastRiskTone,
    nowcastRiskLabel,
    startValue,
    durationValue,
    peakValue,
  } = useMemo(() => {
    const peakProbability = Number.isFinite(Number(nowcast.peakProbability))
      ? Math.round(Number(nowcast.peakProbability))
      : 0;
    const riskTone = !nowcast.hasRain
      ? "minimal"
      : peakProbability >= 70
        ? "high"
        : peakProbability >= 40
          ? "moderate"
          : "low";
    const riskLabel = !nowcast.hasRain
      ? "Dry window"
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
      : "Dry 2h";
    const peak = nowcast.hasData ? `${peakProbability}%` : "\u2014";

    return {
      nowcastRiskTone: riskTone,
      nowcastRiskLabel: riskLabel,
      startValue: start,
      durationValue: duration,
      peakValue: peak,
    };
  }, [nowcast]);

  return (
    <section
      className="bento-nowcast nowcast-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="nowcast-header">
        <div className="nowcast-title-wrap">
          <div className="nowcast-title-row">
            <h3 className="nowcast-title">
              <CloudRain size={16} />
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
          <span className={`nowcast-risk-badge nowcast-risk-badge--${nowcastRiskTone}`}>
            {nowcastRiskLabel}
          </span>
        </div>
      </header>
      <DataTrustMeta
        sourceLabel="Open-Meteo Minutely"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />

      <div className="nowcast-primary">
        <p className="nowcast-summary">{nowcast.summary}</p>
        <p className="nowcast-details">{nowcast.details}</p>
      </div>

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

      <p className="nowcast-meta">
        {nowcast.hasData ? "Short-range precipitation guidance" : "Nowcast offline"}
      </p>
    </section>
  );
}

export default memo(NowcastCard);
