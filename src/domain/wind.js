import { normalizeTemperatureUnit } from "./temperature.js";

export const WIND_SPEED_CONVERSION = 1.60934;

export function formatWindSpeed(speed, targetUnit) {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric)) {
    return "\u2014";
  }
  const nonNegativeSpeed = Math.max(numeric, 0);

  const targetNormalized = normalizeTemperatureUnit(targetUnit);
  const converted = targetNormalized === "C"
    ? Math.round(nonNegativeSpeed * WIND_SPEED_CONVERSION)
    : Math.round(nonNegativeSpeed);

  return `${converted} ${targetNormalized === "C" ? "km/h" : "mph"}`;
}

export function windDirectionName(degrees) {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const numeric = Number(degrees);
  if (!Number.isFinite(numeric)) {
    return "Variable";
  }

  const normalizedDegrees = ((numeric % 360) + 360) % 360;
  const index = Math.round(normalizedDegrees / 22.5) % 16;
  return directions[index];
}

function toMph(speed, unit) {
  const safeSpeed = Number(speed);
  if (!Number.isFinite(safeSpeed)) {
    return Number.NaN;
  }

  if (normalizeTemperatureUnit(unit) === "C") {
    return safeSpeed / WIND_SPEED_CONVERSION;
  }
  return safeSpeed;
}

export function classifyWind(speed, unit = "F") {
  const mph = toMph(speed, unit);
  if (!Number.isFinite(mph)) {
    return "Unknown";
  }

  if (mph < 4) return "Calm";
  if (mph < 13) return "Light breeze";
  if (mph < 25) return "Moderate";
  if (mph < 39) return "Strong";
  if (mph < 55) return "Gale";
  return "Storm force";
}

