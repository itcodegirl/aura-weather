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
  61: { label: "Light Rain", icon: "rain", gradient: ["#3b82f6", "#4f46e5", "#1e293b"] },
  63: { label: "Rain", icon: "rain", gradient: ["#2563eb", "#4338ca", "#0f172a"] },
  65: { label: "Heavy Rain", icon: "rain", gradient: ["#334155", "#1e40af", "#0f172a"] },
  71: { label: "Light Snow", icon: "snow", gradient: ["#bae6fd", "#93c5fd", "#818cf8"] },
  73: { label: "Snow", icon: "snow", gradient: ["#7dd3fc", "#60a5fa", "#6366f1"] },
  75: { label: "Heavy Snow", icon: "snow", gradient: ["#38bdf8", "#3b82f6", "#4f46e5"] },
  80: { label: "Rain Showers", icon: "showers", gradient: ["#3b82f6", "#4f46e5", "#7c3aed"] },
  81: { label: "Showers", icon: "showers", gradient: ["#2563eb", "#4338ca", "#6d28d9"] },
  82: { label: "Heavy Showers", icon: "showers", gradient: ["#334155", "#1e40af", "#6d28d9"] },
  95: { label: "Thunderstorm", icon: "thunderstorm", gradient: ["#1e293b", "#581c87", "#0f172a"] },
  96: { label: "Storm with Hail", icon: "severe", gradient: ["#1e293b", "#581c87", "#000000"] },
  99: { label: "Severe Storm", icon: "severe", gradient: ["#000000", "#3b0764", "#0f172a"] },
};

export function getWeather(code) {
  return weatherCodes[code] || weatherCodes[0];
}

export function gradientCss(gradient) {
  return `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;
}