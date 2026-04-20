// src/utils/meteorology.js

/**
 * Classify storm risk using CAPE (Convective Available Potential Energy).
 * CAPE is the key metric meteorologists use to assess atmospheric instability.
 *
 *   <100   Minimal — stable air
 *   100-500   Low
 *   500-1500  Moderate — thunderstorms possible
 *   1500-2500 High — strong storms likely
 *   >2500   Severe — tornado-favorable conditions
 */
export function classifyStormRisk(cape, weatherCode) {
  const isStormCode = [95, 96, 99].includes(weatherCode);

  if (isStormCode || cape >= 2500) return { level: "Severe", color: "#dc2626", score: 4 };
  if (cape >= 1500) return { level: "High", color: "#f97316", score: 3 };
  if (cape >= 500) return { level: "Moderate", color: "#eab308", score: 2 };
  if (cape >= 100) return { level: "Low", color: "#22c55e", score: 1 };
  return { level: "Minimal", color: "#38bdf8", score: 0 };
}

/**
 * Calculate barometric pressure trend over the last 6 hours.
 * Falling pressure = storm approaching. Rising = clearing.
 */
export function calculatePressureTrend(hourlyPressure, hourlyTime) {
  const now = new Date();
  const nowIdx = hourlyTime.findIndex((t) => new Date(t) >= now);
  const currentIdx = nowIdx === -1 ? hourlyPressure.length - 1 : nowIdx;

  const sixHoursAgo = hourlyPressure[Math.max(0, currentIdx - 6)];
  const current = hourlyPressure[currentIdx] || hourlyPressure[hourlyPressure.length - 1];
  const delta = current - sixHoursAgo;

  let direction, interpretation;
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
  for (let i = Math.max(0, currentIdx - 6); i <= currentIdx; i++) {
    sparkline.push(hourlyPressure[i]);
  }

  return { current, delta, direction, interpretation, sparkline };
}

/**
 * Classify comfort using dewpoint (a better humidity metric than relative humidity).
 *   <50°F   Dry / crisp
 *   50-55  Comfortable
 *   55-60  Pleasant
 *   60-65  Sticky
 *   65-70  Humid
 *   70-75  Oppressive
 *   >75  Miserable (tropical)
 */
export function classifyComfort(dewpoint) {
  if (dewpoint < 50) return { level: "Dry", color: "#38bdf8", position: 10 };
  if (dewpoint < 55) return { level: "Comfortable", color: "#22c55e", position: 30 };
  if (dewpoint < 60) return { level: "Pleasant", color: "#84cc16", position: 45 };
  if (dewpoint < 65) return { level: "Sticky", color: "#eab308", position: 60 };
  if (dewpoint < 70) return { level: "Humid", color: "#f97316", position: 75 };
  if (dewpoint < 75) return { level: "Oppressive", color: "#dc2626", position: 88 };
  return { level: "Miserable", color: "#991b1b", position: 98 };
}

/**
 * Convert wind direction in degrees to 16-point compass name.
 */
export function windDirectionName(degrees) {
  const directions = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Classify wind strength (simplified Beaufort scale).
 */
const MPH_TO_KMH = 1.60934;

function toMph(speed, unit) {
  if (unit === "C") {
    return speed / MPH_TO_KMH;
  }
  return speed;
}

export function classifyWind(speed, unit = "F") {
  const mph = toMph(speed, unit);

  if (mph < 4) return "Calm";
  if (mph < 13) return "Light breeze";
  if (mph < 25) return "Moderate";
  if (mph < 39) return "Strong";
  if (mph < 55) return "Gale";
  return "Storm force";
}
