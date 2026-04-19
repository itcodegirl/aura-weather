// src/utils/weatherCodes.js

/**
 * WMO weather interpretation codes from Open-Meteo.
 * Maps each code to a label, emoji icon, and gradient palette.
 *
 * Gradients are 3-stop to give depth (top → middle → bottom).
 * Palettes are chosen to match the emotional tone of the weather.
 */
export const weatherCodes = {
  0:  { label: "Clear",            icon: "☀️", gradient: ["#f59e0b", "#f97316", "#ef4444"] },
  1:  { label: "Mostly Clear",     icon: "🌤️", gradient: ["#fbbf24", "#f59e0b", "#ec4899"] },
  2:  { label: "Partly Cloudy",    icon: "⛅", gradient: ["#60a5fa", "#818cf8", "#a78bfa"] },
  3:  { label: "Overcast",         icon: "☁️", gradient: ["#94a3b8", "#64748b", "#334155"] },
  45: { label: "Foggy",            icon: "🌫️", gradient: ["#cbd5e1", "#94a3b8", "#64748b"] },
  48: { label: "Rime Fog",         icon: "🌫️", gradient: ["#cbd5e1", "#94a3b8", "#64748b"] },
  51: { label: "Light Drizzle",    icon: "🌦️", gradient: ["#60a5fa", "#0891b2", "#0f766e"] },
  53: { label: "Drizzle",          icon: "🌦️", gradient: ["#3b82f6", "#0e7490", "#115e59"] },
  55: { label: "Heavy Drizzle",    icon: "🌧️", gradient: ["#2563eb", "#0e7490", "#134e4a"] },
  61: { label: "Light Rain",       icon: "🌧️", gradient: ["#3b82f6", "#4f46e5", "#1e293b"] },
  63: { label: "Rain",             icon: "🌧️", gradient: ["#2563eb", "#4338ca", "#0f172a"] },
  65: { label: "Heavy Rain",       icon: "⛈️", gradient: ["#334155", "#1e40af", "#0f172a"] },
  71: { label: "Light Snow",       icon: "🌨️", gradient: ["#bae6fd", "#93c5fd", "#818cf8"] },
  73: { label: "Snow",             icon: "❄️", gradient: ["#7dd3fc", "#60a5fa", "#6366f1"] },
  75: { label: "Heavy Snow",       icon: "❄️", gradient: ["#38bdf8", "#3b82f6", "#4f46e5"] },
  80: { label: "Rain Showers",     icon: "🌦️", gradient: ["#3b82f6", "#4f46e5", "#7c3aed"] },
  81: { label: "Showers",          icon: "🌧️", gradient: ["#2563eb", "#4338ca", "#6d28d9"] },
  82: { label: "Heavy Showers",    icon: "⛈️", gradient: ["#334155", "#1e40af", "#6d28d9"] },
  95: { label: "Thunderstorm",     icon: "⛈️", gradient: ["#1e293b", "#581c87", "#0f172a"] },
  96: { label: "Storm with Hail",  icon: "⛈️", gradient: ["#1e293b", "#581c87", "#000000"] },
  99: { label: "Severe Storm",     icon: "⛈️", gradient: ["#000000", "#3b0764", "#0f172a"] },
};

export function getWeather(code) {
  return weatherCodes[code] || weatherCodes[0];
}

export function gradientCss(gradient) {
  return `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;
}