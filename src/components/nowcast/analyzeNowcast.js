import { resolveWindowStart } from "../../utils/timeSeries.js";
import { toFiniteNumber } from "../../utils/numbers.js";

const RAIN_WEATHER_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);
export const NOWCAST_STEP_MINUTES = 15;

/*
 * How precisely this card is allowed to speak.
 *
 * The series behind it is `minutely_15.precipitation_probability`: a *chance*
 * of precipitation, sampled every quarter hour. Two things follow, and the
 * copy used to respect neither.
 *
 * First, a probability crossing a threshold at slot N is not rain beginning at
 * N x 15 minutes. It is the model's confidence for that window rising past a
 * bar. "Moderate rain starting in 15 minutes, lasting ~30 minutes" states a
 * start time and a duration the series does not carry.
 *
 * Second, the quarter-hour cadence is not a claim about resolution, and the
 * measurement is no longer second-hand. Re-measured live against Open-Meteo
 * on 2026-09-19 for the default city (Chicago 41.70,-87.82): 192 quarter-hour
 * points against 48 hourly, and every one of the 47 on-the-hour points
 * equalled the hourly value exactly. The points between them sat on the line
 * joining their neighbours -- mean deviation 0.53 percentage points, max 2.0,
 * with 81 of 141 exactly round(linear).
 *
 * Berlin was measured as a control, because Open-Meteo documents native
 * 15-minutely output for the ICON-D2 region and interpolation from hourly
 * elsewhere. It gave the same signature: 47/47 anchors, mean deviation 0.41.
 * So for precipitation_probability specifically the quarter-hour series looks
 * like an expansion of the hourly one everywhere, not only in the US, and
 * "built from 15-minute weather points" is false.
 *
 * So timings go in buckets. The card still answers the question a reader
 * actually has — is rain likely soon, and for long? — without naming a minute
 * it cannot know. The buckets live here rather than in the card so the
 * sentence and the tiles above it cannot drift apart.
 */
const START_BUCKETS = [
  { maxMinutes: 0, tile: "Now", phrase: "now" },
  { maxMinutes: 30, tile: "< 30 min", phrase: "within the next half hour" },
  { maxMinutes: 60, tile: "< 1 hr", phrase: "within the hour" },
  { maxMinutes: Infinity, tile: "1-2 hr", phrase: "later in the next 2 hours" },
];

const DURATION_BUCKETS = [
  { maxMinutes: 30, tile: "< 30 min", phrase: "passing quickly" },
  { maxMinutes: 60, tile: "~1 hr", phrase: "lasting about an hour" },
  {
    maxMinutes: Infinity,
    tile: "1 hr +",
    phrase: "lasting through most of the window",
  },
];

function bucketFor(buckets, minutes) {
  const value = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return buckets.find((bucket) => value <= bucket.maxMinutes) ?? buckets.at(-1);
}

/** When rain becomes likely, coarse enough to be true. `{ tile, phrase }`. */
export function describeNowcastStart(startInMinutes) {
  return bucketFor(START_BUCKETS, startInMinutes);
}

/** How long it stays likely, same register. `{ tile, phrase }`. */
export function describeNowcastDuration(durationMinutes) {
  return bucketFor(DURATION_BUCKETS, durationMinutes);
}
const NOWCAST_WINDOW_SIZE = 8; // next 2 hours with 15-min resolution

function clampProbability(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  // A non-finite input is missing data, not a confident 0% — surface it as
  // null so the trust contract holds even if a caller skips normalizeProbability.
  return Number.isFinite(clamped) ? clamped : null;
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
      probabilityAvailable: false,
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

  // The 15-minute timestamps are the location's naive wall clock. The zone
  // goes to resolveWindowStart, which turns them into real instants, so
  // `now` is the real clock rather than one reframed to match a misparse.
  //
  // A `stale` status means the whole series lies behind now — a replayed
  // snapshot whose window has closed. It takes the same branch as no data
  // at all, deliberately: this card's copy is present-tense throughout, and
  // there is no honest way to say "rain likely now" from a closed window.
  const referenceNow = toFiniteNumber(options.now) ?? Date.now();
  const { index: normalizedStartIdx } = resolveWindowStart(time, {
    now: referenceNow,
    timeZone: options.timeZone,
  });

  if (normalizedStartIdx < 0) {
    return {
      hasData: false,
      hasRain: false,
      probabilityAvailable: false,
      startInMinutes: null,
      durationMinutes: null,
      peakProbability: null,
      series: [],
      times: [],
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
        time: timeValue ?? null,
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
      probabilityAvailable: false,
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
      probabilityAvailable: false,
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
  // Carry missing probability slots through as null so the chart can gap the
  // curve at those points instead of drawing a confident 0% over unknown data.
  const probabilitySeries = rows.map((row) => row.probability);
  // Parallel to probabilitySeries. The strip marks its hour anchors from
  // these rather than from index arithmetic: the window starts at whatever
  // quarter-hour is current, so it holds two or three on-the-hour points
  // depending on the time of day.
  const probabilityTimes = rows.map((row) => row.time);

  // A dry verdict reached without any probability reading is weaker evidence
  // than one backed by real percentages; the card must be able to qualify its
  // scannable language ("Likely dry") to match the details sentence.
  const probabilityAvailable = rows.some((row) => row.probability !== null);

  const firstWetIndex = rows.findIndex((row) => row.isWet);
  if (firstWetIndex === -1) {
    const probabilityRows = rows.filter((row) => row.probability !== null);
    const peakProbability = probabilityRows.length
      ? probabilityRows.reduce((max, row) => Math.max(max, row.probability), 0)
      : null;
    return {
      hasData: true,
      hasRain: false,
      probabilityAvailable,
      startInMinutes: 0,
      durationMinutes: 0,
      peakProbability,
      series: probabilitySeries,
      times: probabilityTimes,
      summary: "Dry for the next 2 hours.",
      details:
        peakProbability === null
          ? "Rain chance is unavailable, but no wet weather code or accumulation was returned."
          : `Peak rain chance reaches ${peakProbability}% in the near term.`,
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
  // "likely", not "starting": the series is a chance, not an observation.
  const summary = `${intensity} rain likely ${describeNowcastStart(startInMinutes).phrase}, ${describeNowcastDuration(durationMinutes).phrase}`;
  const averageProbability = probabilityRows.length
    ? Math.round(
        probabilityRows.reduce((sum, row) => sum + row.probability, 0) /
          probabilityRows.length
      )
    : null;

  return {
    hasData: true,
    hasRain: true,
    probabilityAvailable,
    startInMinutes,
    durationMinutes,
    peakProbability,
    averageProbability,
    series: probabilitySeries,
    times: probabilityTimes,
    summary,
    details:
      peakProbability === null
        ? "Wet signal is based on weather code or accumulation; chance is unavailable."
        : `Peak chance ${Math.round(peakProbability)}% (${averageProbability}% average).`,
  };
}
