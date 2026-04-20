import { memo, useMemo } from "react";
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

function analyzeNowcast(minutely15) {
  if (!minutely15?.time?.length || minutely15.time.length === 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: 0,
      peakProbability: 0,
      summary: "Nowcast unavailable.",
      details: "Minute-by-minute precipitation details are not available.",
    };
  }

  const { time, precipitation_probability = [], precipitation = [], weather_code = [] } =
    minutely15;

  const now = new Date();
  const startIdx = time.findIndex((t) => new Date(t) >= now);
  const normalizedStartIdx = startIdx === -1 ? 0 : startIdx;

  const rows = time
    .slice(normalizedStartIdx, normalizedStartIdx + NOWCAST_WINDOW_SIZE)
    .map((timestamp, i) => {
      const idx = normalizedStartIdx + i;
      const probability = clampProbability(toFiniteNumber(precipitation_probability[idx], 0));
      const rainAmount = Math.max(toFiniteNumber(precipitation[idx], 0), 0);
      const code = Number(weather_code[idx] || 0);
      const isWet =
        probability >= 25 ||
        rainAmount > 0 ||
        RAIN_WEATHER_CODES.has(code);
      return {
        timestamp: new Date(timestamp),
        probability,
        rainAmount,
        isWet,
      };
    });

  if (rows.length === 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: 0,
      peakProbability: 0,
      summary: "No minute-by-minute data in range.",
      details: "No nowcast points were available in the next two hours.",
    };
  }

  const firstWetIndex = rows.findIndex((row) => row.isWet);
  if (firstWetIndex === -1) {
    return {
      hasData: true,
      hasRain: false,
      startInMinutes: 0,
      durationMinutes: 0,
      peakProbability: rows.reduce((max, row) => Math.max(max, row.probability), 0),
      summary: "No rain expected in the next 2 hours.",
      details: "Clear windows across the next 120 minutes.",
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
    windowRows.reduce((sum, row) => sum + row.probability, 0) / windowRows.length
  );

  return {
    hasData: true,
    hasRain: true,
    startInMinutes,
    durationMinutes,
    peakProbability,
    averageProbability,
    summary,
    details: `Peak chance ${Math.round(peakProbability)}% (${averageProbability}% avg).`,
  };
}

function NowcastCard({ weather, style }) {
  const nowcast = useMemo(() => analyzeNowcast(weather?.minutely_15), [weather?.minutely_15]);

  return (
    <section className="bento-nowcast nowcast-card" style={style}>
      <header className="nowcast-header">
        <div className="nowcast-title">
          <CloudRain size={16} />
          <span>Nowcast</span>
        </div>
      </header>

      <p className="nowcast-summary" role="status" aria-live="polite">
        {nowcast.summary}
      </p>

      <div className="nowcast-meta">
        <span>{nowcast.hasData ? "Next 2 hours" : "Unavailable now"}</span>
        <span>{nowcast.details}</span>
      </div>
    </section>
  );
}

export default memo(NowcastCard);
