import { toFahrenheit } from "./temperature.js";
import { toFiniteNumber } from "../utils/numbers.js";

/**
 * Classify storm risk using CAPE (Convective Available Potential Energy).
 */
export function classifyStormRisk(cape, weatherCode) {
  const capeValue = toFiniteNumber(cape);
  const normalizedCape = capeValue ?? 0;
  const codeValue = toFiniteNumber(weatherCode);
  const normalizedCode = codeValue !== null ? Math.trunc(codeValue) : Number.NaN;
  const isStormCode = [95, 96, 99].includes(normalizedCode);

  if (isStormCode || normalizedCape >= 2500) {
    return { level: "Severe", color: "#dc2626", score: 4 };
  }
  if (normalizedCape >= 1500) {
    return { level: "High", color: "#f97316", score: 3 };
  }
  if (normalizedCape >= 500) {
    return { level: "Moderate", color: "#eab308", score: 2 };
  }
  if (normalizedCape >= 100) {
    return { level: "Low", color: "#22c55e", score: 1 };
  }
  return { level: "Minimal", color: "#38bdf8", score: 0 };
}

/**
 * Calculate barometric pressure trend over the last 6 hours.
 */
export function calculatePressureTrend(hourlyPressure, hourlyTime) {
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

  const now = new Date();
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

  const nowIdx = paired.findIndex((entry) => entry.time >= now.getTime());
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

  const sixHoursAgo =
    paired[Math.max(0, currentIdx - 6)]?.value ?? paired[0]?.value;
  const current = paired[currentIdx]?.value ?? paired[paired.length - 1]?.value;
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
  for (let i = Math.max(0, currentIdx - 6); i <= currentIdx; i += 1) {
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

