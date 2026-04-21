import { useMemo } from "react";
import { CloudRain } from "lucide-react";
import "./NowcastCard.css";

const RAIN_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const NOWCAST_STEP_MINUTES = 15;
const NOWCAST_WINDOW_SIZE = 8; // next 2 hours with 15-min resolution

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

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

  const now = new Date();
  const nowMs = now.getTime();
  let normalizedStartIdx = 0;
  for (let i = 0; i < time.length; i += 1) {
    const timestamp = new Date(time[i]).getTime();
    if (Number.isFinite(timestamp) && timestamp >= nowMs) {
      normalizedStartIdx = i;
      break;
    }
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
      summary: "No rain expected in the next 2 hours.",
      details: "Mostly dry across the next 120 minutes.",
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

function NowcastCard({ weather, style }) {
  const nowcast = useMemo(() => analyzeNowcast(weather?.nowcast), [weather?.nowcast]);
  const peakProbability = Number.isFinite(Number(nowcast.peakProbability))
    ? Math.round(Number(nowcast.peakProbability))
    : 0;
  const nowcastRiskTone = !nowcast.hasRain
    ? "minimal"
    : peakProbability >= 70
      ? "high"
      : peakProbability >= 40
        ? "moderate"
        : "low";
  const nowcastRiskLabel = !nowcast.hasRain
    ? "Dry window"
    : nowcastRiskTone === "high"
      ? "High immediate risk"
      : nowcastRiskTone === "moderate"
        ? "Moderate immediate risk"
        : "Low immediate risk";
  const startValue = nowcast.hasRain
    ? nowcast.startInMinutes === 0
      ? "Now"
      : `${nowcast.startInMinutes} min`
    : "\u2014";
  const durationValue = nowcast.hasRain
    ? `${Math.max(0, Math.round(nowcast.durationMinutes))} min`
    : "Dry 2h";
  const peakValue = nowcast.hasData
    ? `${peakProbability}%`
    : "\u2014";

  return (
    <section className="bento-nowcast nowcast-card" style={style}>
      <header className="nowcast-header">
        <div className="nowcast-title-wrap">
          <h2 className="nowcast-title">
            <CloudRain size={16} />
            <span>Nowcast</span>
          </h2>
          <span className={`nowcast-risk-badge nowcast-risk-badge--${nowcastRiskTone}`}>
            {nowcastRiskLabel}
          </span>
        </div>
      </header>

      <div className="nowcast-primary" role="status" aria-live="polite">
        <p className="nowcast-summary">{nowcast.summary}</p>
        <p className="nowcast-details">{nowcast.details}</p>
      </div>

      <div className="nowcast-chips" role="list" aria-label="Immediate precipitation details">
        <div className="nowcast-chip" role="listitem">
          <span className="nowcast-chip-label">Start</span>
          <span className="nowcast-chip-value">{startValue}</span>
        </div>
        <div className="nowcast-chip" role="listitem">
          <span className="nowcast-chip-label">Duration</span>
          <span className="nowcast-chip-value">{durationValue}</span>
        </div>
        <div className="nowcast-chip" role="listitem">
          <span className="nowcast-chip-label">Peak chance</span>
          <span className="nowcast-chip-value">{peakValue}</span>
        </div>
      </div>

      <p className="nowcast-meta">{nowcast.hasData ? "15-minute outlook" : "Nowcast offline"}</p>
    </section>
  );
}

export default NowcastCard;
