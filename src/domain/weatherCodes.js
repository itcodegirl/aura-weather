import { toFiniteNumber } from "../utils/numbers.js";

/**
 * WMO weather interpretation codes from Open-Meteo.
 */
/*
 * Each descriptor's gradient is a 3-stop "Glacier" sky palette
 * (atmospheric top → mid → deep base) painted full-bleed behind the
 * frosted-glass UI. The palette is deliberately deep and premium: a
 * dark navy/indigo dusk so the light-on-dark glass cards read as
 * elevated rather than muddy. Each condition keeps its hue character
 * (clear = blue, fog = slate, snow = cool steel, storm = indigo) but
 * lands dark. The decorative accent glows in App.css (.app::after) and
 * the AtmosphereParticles layer add the "alive" highlights on top.
 */
export const weatherCodes = {
  0: { label: "Clear", icon: "clear", gradient: ["#1c3a5c", "#102338", "#070f1d"] },
  1: { label: "Mostly Clear", icon: "mostly_clear", gradient: ["#1b3656", "#0f2134", "#070e1c"] },
  2: { label: "Partly Cloudy", icon: "partly_cloudy", gradient: ["#1d3851", "#102031", "#080f1c"] },
  3: { label: "Overcast", icon: "overcast", gradient: ["#283039", "#181f28", "#0c1117"] },
  45: { label: "Foggy", icon: "fog", gradient: ["#2c333d", "#1c222b", "#10151c"] },
  48: { label: "Rime Fog", icon: "fog", gradient: ["#2e353f", "#1e242d", "#11161d"] },
  51: { label: "Light Drizzle", icon: "drizzle", gradient: ["#1e3445", "#13212e", "#0a131c"] },
  53: { label: "Drizzle", icon: "drizzle", gradient: ["#1b3040", "#111d29", "#091018"] },
  55: { label: "Heavy Drizzle", icon: "drizzle", gradient: ["#182a38", "#0f1924", "#080e15"] },
  56: { label: "Freezing Drizzle", icon: "drizzle", gradient: ["#21384a", "#142430", "#0a141c"] },
  57: { label: "Heavy Freezing Drizzle", icon: "drizzle", gradient: ["#1d3344", "#12202c", "#091018"] },
  61: { label: "Light Rain", icon: "rain", gradient: ["#1a2e3d", "#101c27", "#080f17"] },
  63: { label: "Rain", icon: "rain", gradient: ["#172836", "#0e1923", "#070d14"] },
  65: { label: "Heavy Rain", icon: "rain", gradient: ["#142330", "#0c151f", "#060b12"] },
  66: { label: "Freezing Rain", icon: "rain", gradient: ["#1e3849", "#13222f", "#0a141d"] },
  67: { label: "Heavy Freezing Rain", icon: "rain", gradient: ["#1a3140", "#101e2a", "#091017"] },
  71: { label: "Light Snow", icon: "snow", gradient: ["#2a3f52", "#1b2c3b", "#0f1c28"] },
  73: { label: "Snow", icon: "snow", gradient: ["#283d50", "#192a39", "#0e1a26"] },
  75: { label: "Heavy Snow", icon: "snow", gradient: ["#26384a", "#172634", "#0d1823"] },
  77: { label: "Snow Grains", icon: "snow", gradient: ["#2b4053", "#1c2d3c", "#101d29"] },
  80: { label: "Rain Showers", icon: "showers", gradient: ["#1c3243", "#11202d", "#09111a"] },
  81: { label: "Showers", icon: "showers", gradient: ["#192d3d", "#0f1c28", "#080f17"] },
  82: { label: "Heavy Showers", icon: "showers", gradient: ["#152433", "#0d1620", "#060c13"] },
  85: { label: "Light Snow Showers", icon: "showers", gradient: ["#293e51", "#1a2b3a", "#0e1b27"] },
  86: { label: "Heavy Snow Showers", icon: "showers", gradient: ["#26384b", "#172635", "#0d1824"] },
  95: { label: "Thunderstorm", icon: "thunderstorm", gradient: ["#1a1f2e", "#12151f", "#080a11"] },
  96: { label: "Storm with Hail", icon: "severe", gradient: ["#181c29", "#0f121b", "#070910"] },
  99: { label: "Severe Storm", icon: "severe", gradient: ["#161a26", "#0e111a", "#06080e"] },
};

export function getWeather(code) {
  const numericCode = toFiniteNumber(code);
  if (numericCode === null) {
    return weatherCodes[0];
  }

  const normalizedCode = Math.trunc(numericCode);
  return weatherCodes[normalizedCode] || weatherCodes[0];
}

export function gradientCss(gradient) {
  if (!Array.isArray(gradient) || gradient.length < 3) {
    return "linear-gradient(180deg, #1c3a5c 0%, #102338 50%, #070f1d 100%)";
  }

  return `linear-gradient(180deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;
}

