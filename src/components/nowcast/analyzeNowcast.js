import { findWindowStartIndex } from "../../utils/timeSeries.js";
import { toFiniteNumber } from "../../utils/numbers.js";
import { getZonedNow } from "../../utils/dates.js";

const RAIN_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
const NOWCAST_STEP_MINUTES = 15;
const NOWCAST_WINDOW_SIZE = 8; // next 2 hours with 15-min resolution

function clampProbability(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return Number.isFinite(clamped) ? clamped : 0;
}

function normalizeProbability(value) {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : clampProbability(parsed);
}

function normalizeAmount(value) {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : Math.max(parsed, 0);
}

export function analyzeNowcast(nowcast, options = {}) {
  if (!Array.isArray(nowcast?.time) || nowcast.time.length === 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: null,
      peakProbability: null,
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

  // The 15-minute timestamps are the location's naive wall clock, so the
  // window must be anchored to the location's "now". Tests inject an
  // explicit `now`; the card passes the location's IANA zone.
  const referenceNow =
    toFiniteNumber(options.now) ?? getZonedNow(options.timeZone).getTime();
  const normalizedStartIdx = findWindowStartIndex(time, {
    now: referenceNow,
    windowSize: NOWCAST_WINDOW_SIZE,
  });

  if (normalizedStartIdx < 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: null,
      peakProbability: null,
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
      const probability = normalizeProbability(precipitationProbabilitySeries[idx]);
      const rainAmount = normalizeAmount(precipitationSeries[idx]);
      const code = toFiniteNumber(weatherCodeSeries[idx]);
      const isWet =
        (probability !== null && probability >= 25) ||
        (rainAmount !== null && rainAmount > 0) ||
        (code !== null && RAIN_WEATHER_CODES.has(code));
      return {
        probability,
        rainAmount,
        code,
        isWet,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: null,
      peakProbability: null,
      summary: "No minute-by-minute points are available.",
      details: "The next 2-hour nowcast window returned no valid data points.",
    };
  }

  const hasData = rows.some(
    (row) =>
      row.probability !== null ||
      row.rainAmount !== null ||
      row.code !== null
  );

  if (!hasData) {
    return {
      hasData: false,
      hasRain: false,
      startInMinutes: null,
      durationMinutes: null,
      peakProbability: null,
      summary: "Nowcast data is unavailable.",
      details: "15-minute precipitation readings are missing from the provider.",
    };
  }

  // The chart and the readouts must share one now-anchored window so the
  // curve matches the headline (previously the chart sliced the raw array
  // from index 0, which is in the past, and rendered a flat line).
  const probabilitySeries = rows.map((row) =>
    row.probability === null ? 0 : row.probability
  );

  const firstWetIndex = rows.findIndex((row) => row.isWet);
  if (firstWetIndex === -1) {
    const probabilityRows = rows.filter((row) => row.probability !== null);
    const peakProbability = probabilityRows.length
      ? probabilityRows.reduce((max, row) => Math.max(max, row.probability), 0)
      : null;
    return {
      hasData: true,
      hasRain: false,
      startInMinutes: 0,
      durationMinutes: 0,
      peakProbability,
      series: probabilitySeries,
      summary: "Dry for the next 2 hours.",
      details:
        peakProbability === null
          ? "Rain chance is unavailable, but no wet weather code or accumulation was returned."
          : `Peak rain chance stays below ${peakProbability}% in the near term.`,
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
  const probabilityRows = windowRows.filter((row) => row.probability !== null);
  const peakProbability = probabilityRows.length
    ? clampProbability(Math.max(...probabilityRows.map((row) => row.probability)))
    : null;
  const startInMinutes = Math.max(firstWetIndex * NOWCAST_STEP_MINUTES, 0);
  const durationMinutes = Math.max(windowRows.length * NOWCAST_STEP_MINUTES, NOWCAST_STEP_MINUTES);
  const intensity =
    peakProbability === null
      ? "Possible"
      : peakProbability >= 65
        ? "Heavy"
        : peakProbability >= 35
          ? "Moderate"
          : "Light";
  const startMinutesText =
    startInMinutes === 0
      ? "now"
      : `${startInMinutes} minute${startInMinutes === 1 ? "" : "s"}`;
  const startPhrase =
    startInMinutes === 0 ? "starting now" : `starting in ${startMinutesText}`;
  const summary = `${intensity} rain ${startPhrase}, lasting ~${durationMinutes} minutes`;
  const averageProbability = probabilityRows.length
    ? Math.round(
        probabilityRows.reduce((sum, row) => sum + row.probability, 0) /
          probabilityRows.length
      )
    : null;

  return {
    hasData: true,
    hasRain: true,
    startInMinutes,
    durationMinutes,
    peakProbability,
    averageProbability,
    series: probabilitySeries,
    summary,
    details:
      peakProbability === null
        ? "Wet signal is based on weather code or accumulation; chance is unavailable."
        : `Peak chance ${Math.round(peakProbability)}% (${averageProbability}% average).`,
  };
}
