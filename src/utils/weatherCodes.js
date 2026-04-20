// src/utils/weatherCodes.js

/**
 * WMO weather interpretation codes from Open-Meteo.
 * Maps each code to a label and gradient palette.
 */
export const weatherCodes = {
  0: { label: "Clear", icon: "clear", gradient: ["#fb923c", "#ec4899", "#6366f1"] },
  1: { label: "Mostly Clear", icon: "mostly_clear", gradient: ["#fbbf24", "#f472b6", "#818cf8"] },
  2: { label: "Partly Cloudy", icon: "partly_cloudy", gradient: ["#60a5fa", "#818cf8", "#a78bfa"] },
  3: { label: "Overcast", icon: "overcast", gradient: ["#94a3b8", "#64748b", "#334155"] },
  45: { label: "Foggy", icon: "fog", gradient: ["#cbd5e1", "#94a3b8", "#64748b"] },
  48: { label: "Rime Fog", icon: "fog", gradient: ["#cbd5e1", "#94a3b8", "#64748b"] },
  51: { label: "Light Drizzle", icon: "drizzle", gradient: ["#60a5fa", "#0891b2", "#0f766e"] },
  53: { label: "Drizzle", icon: "drizzle", gradient: ["#3b82f6", "#0e7490", "#115e59"] },
  55: { label: "Heavy Drizzle", icon: "drizzle", gradient: ["#2563eb", "#0e7490", "#134e4a"] },
  56: { label: "Freezing Drizzle", icon: "drizzle", gradient: ["#22d3ee", "#0284c7", "#0f766e"] },
  57: { label: "Heavy Freezing Drizzle", icon: "drizzle", gradient: ["#0891b2", "#0369a1", "#0f766e"] },
  61: { label: "Light Rain", icon: "rain", gradient: ["#3b82f6", "#4f46e5", "#1e293b"] },
  63: { label: "Rain", icon: "rain", gradient: ["#2563eb", "#4338ca", "#0f172a"] },
  65: { label: "Heavy Rain", icon: "rain", gradient: ["#334155", "#1e40af", "#0f172a"] },
  66: { label: "Freezing Rain", icon: "rain", gradient: ["#06b6d4", "#0284c7", "#0f766e"] },
  67: { label: "Heavy Freezing Rain", icon: "rain", gradient: ["#0e7490", "#0369a1", "#0f766e"] },
  71: { label: "Light Snow", icon: "snow", gradient: ["#bae6fd", "#93c5fd", "#818cf8"] },
  73: { label: "Snow", icon: "snow", gradient: ["#7dd3fc", "#60a5fa", "#6366f1"] },
  75: { label: "Heavy Snow", icon: "snow", gradient: ["#38bdf8", "#3b82f6", "#4f46e5"] },
  77: { label: "Snow Grains", icon: "snow", gradient: ["#bae6fd", "#7dd3fc", "#60a5fa"] },
  80: { label: "Rain Showers", icon: "showers", gradient: ["#3b82f6", "#4f46e5", "#7c3aed"] },
  81: { label: "Showers", icon: "showers", gradient: ["#2563eb", "#4338ca", "#6d28d9"] },
  82: { label: "Heavy Showers", icon: "showers", gradient: ["#334155", "#1e40af", "#6d28d9"] },
  85: { label: "Light Snow Showers", icon: "showers", gradient: ["#bae6fd", "#7dd3fc", "#60a5fa"] },
  86: { label: "Heavy Snow Showers", icon: "showers", gradient: ["#7dd3fc", "#3b82f6", "#2563eb"] },
  95: { label: "Thunderstorm", icon: "thunderstorm", gradient: ["#1e293b", "#581c87", "#0f172a"] },
  96: { label: "Storm with Hail", icon: "severe", gradient: ["#1e293b", "#581c87", "#000000"] },
  99: { label: "Severe Storm", icon: "severe", gradient: ["#000000", "#3b0764", "#0f172a"] },
};

export function getWeather(code) {
  const numericCode = Number(code);
  if (!Number.isFinite(numericCode)) {
    return weatherCodes[0];
  }

  const normalizedCode = Math.trunc(numericCode);
  return weatherCodes[normalizedCode] || weatherCodes[0];
}

export function gradientCss(gradient) {
  if (!Array.isArray(gradient) || gradient.length < 3) {
    return "linear-gradient(135deg, #fb923c 0%, #ec4899 50%, #6366f1 100%)";
  }

  return `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;
}
