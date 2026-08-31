import { toFahrenheit } from "./temperature.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { getZonedNow } from "../utils/dates.js";

const HOUR_MS = 60 * 60 * 1000;
const TREND_LOOKBACK_MS = 6 * HOUR_MS;
// The 6-hours-ago baseline must actually be ~6 hours old. A sample more
// than 30 minutes off the mark would silently relabel a different window
// as "the last 6 hours", so it is rejected rather than accepted.
const TREND_LOOKBACK_TOLERANCE_MS = 30 * 60 * 1000;

/**
 * Classify storm risk using CAPE (Convective Available Potential Energy).
 */
export function classifyStormRisk(cape, weatherCode) {
  const capeValue = toFiniteNumber(cape);
  const normalizedCape = capeValue ?? 0;
  const codeValue = toFiniteNumber(weatherCode);
  const normalizedCode = codeValue !== null ? Math.trunc(codeValue) : Number.NaN;
  const isStormCode = [95, 96, 99].includes(normalizedCode);

  /*
   * No colour here. This is domain code, and the hex it used to return was a
   * second, drifting copy of the --risk-* ramp in App.css: "Severe" had
   * settled on #dc2626 against the ramp's #ef4444, and "Minimal"'s #38bdf8
   * was not a ramp stop at all (nor reachable — the meter only renders above
   * score 0). The ramp is the shared ladder the hero UV track already draws
   * from, so it is the one source of truth; StormWatch.css maps score to it
   * by tone, the same way the headline does.
   */
  if (isStormCode || normalizedCape >= 2500) {
    return { level: "Severe", score: 4 };
  }
  if (normalizedCape >= 1500) {
    return { level: "High", score: 3 };
  }
  if (normalizedCape >= 500) {
    return { level: "Moderate", score: 2 };
  }
  if (normalizedCape >= 100) {
    return { level: "Low", score: 1 };
  }
  return { level: "Minimal", score: 0 };
}

/**
 * Calculate barometric pressure trend over the last 6 hours.
 *
 * `timeZone` is the location's IANA zone (`weather.meta.timezone`):
 * Open-Meteo hourly timestamps are naive location-local strings that
 * `new Date()` parses in the *device* zone, so "now" must be reframed
 * into the location's wall clock (getZonedNow) before any comparison —
 * otherwise a viewer hours away anchors on the wrong sample. `now` is
 * an injectable clock for tests, per analyzeNowcast/useRainAnalysis.
 */
export function calculatePressureTrend(hourlyPressure, hourlyTime, options = {}) {
  if (
    !Array.isArray(hourlyPressure) ||
    !Array.isArray(hourlyTime) ||
    hourlyPressure.length === 0 ||
    hourlyTime.length === 0
  ) {
    return {
      current: null,
      delta: 0,
      direction: "steady",
      interpretation: "No data",
      sparkline: [],
    };
  }

  const referenceNow = getZonedNow(options.timeZone, options.now).getTime();
  const paired = [];
  const maxIndex = Math.min(hourlyPressure.length, hourlyTime.length);

  for (let i = 0; i < maxIndex; i += 1) {
    const value = toFiniteNumber(hourlyPressure[i]);
    const time = new Date(hourlyTime[i]).getTime();
    if (value !== null && Number.isFinite(time)) {
      paired.push({ value, time });
    }
  }

  if (!paired.length) {
    return {
      current: null,
      delta: 0,
      direction: "steady",
      interpretation: "No data",
      sparkline: [],
    };
  }

  const nowIdx = paired.findIndex((entry) => entry.time >= referenceNow);
  const currentIdx = nowIdx === -1 ? paired.length - 1 : nowIdx;

  // A single usable sample compares against itself (delta 0), which
  // used to read as a confident "Stable" trend computed from no trend
  // data at all. Surface the current reading but say the trend is
  // uncomputable.
  if (paired.length < 2) {
    return {
      current: paired[currentIdx]?.value ?? null,
      delta: 0,
      direction: "steady",
      interpretation: "Not enough data",
      sparkline: paired.map((entry) => entry.value),
    };
  }

  // The baseline is selected by TIMESTAMP, not by counting samples back:
  // nulls are filtered above, so "6 entries ago" can silently be 9+ real
  // hours ago when the series has gaps, mislabeling a stretched window
  // as "the last 6 hours".
  const currentTime = paired[currentIdx].time;
  const targetTime = currentTime - TREND_LOOKBACK_MS;
  let baselineIdx = -1;
  for (let i = 0; i < currentIdx; i += 1) {
    const distance = Math.abs(paired[i].time - targetTime);
    if (
      distance <= TREND_LOOKBACK_TOLERANCE_MS &&
      (baselineIdx === -1 ||
        distance < Math.abs(paired[baselineIdx].time - targetTime))
    ) {
      baselineIdx = i;
    }
  }

  if (baselineIdx === -1) {
    // No usable ~6h-old sample: the trend is uncomputable, not "Stable".
    return {
      current: paired[currentIdx].value,
      delta: 0,
      direction: "steady",
      interpretation: "Not enough data",
      sparkline: paired
        .filter(
          (entry) => entry.time >= targetTime && entry.time <= currentTime
        )
        .map((entry) => entry.value),
    };
  }

  const sixHoursAgo = paired[baselineIdx].value;
  const current = paired[currentIdx].value;
  const delta = current - sixHoursAgo;

  let direction;
  let interpretation;
  if (delta > 1.5) {
    direction = "rising";
    interpretation = "Clearing";
  } else if (delta < -1.5) {
    direction = "falling";
    interpretation = "Storm possible";
  } else {
    direction = "steady";
    interpretation = "Stable";
  }

  const sparkline = [];
  for (let i = baselineIdx; i <= currentIdx; i += 1) {
    const value = paired[i]?.value;
    if (Number.isFinite(value)) {
      sparkline.push(value);
    }
  }

  return { current, delta, direction, interpretation, sparkline };
}

/**
 * Classify comfort using dewpoint.
 */
export function classifyComfort(dewpoint, unit = "F") {
  const thresholdValue = toFahrenheit(dewpoint, unit);
  if (!Number.isFinite(thresholdValue)) {
    return { level: "Unknown", color: "#94a3b8", position: 50 };
  }

  if (thresholdValue < 50) return { level: "Dry", color: "#38bdf8", position: 10 };
  if (thresholdValue < 55) {
    return { level: "Comfortable", color: "#22c55e", position: 30 };
  }
  if (thresholdValue < 60) return { level: "Pleasant", color: "#84cc16", position: 45 };
  if (thresholdValue < 65) return { level: "Sticky", color: "#eab308", position: 60 };
  if (thresholdValue < 70) return { level: "Humid", color: "#f97316", position: 75 };
  if (thresholdValue < 75) {
    return { level: "Oppressive", color: "#dc2626", position: 88 };
  }
  return { level: "Miserable", color: "#991b1b", position: 98 };
}

