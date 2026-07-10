// src/components/WeatherIcon.jsx

import {
  Sun,
  CloudSun,
  Cloud,
  Cloudy,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudLightning,
  CloudSnow,
  Snowflake,
  Tornado,
  CloudOff,
} from "lucide-react";
import { toFiniteNumber } from "../utils/numbers";
import "./WeatherIcon.css";

const iconMap = {
  0: Sun,
  1: CloudSun,
  2: Cloud,
  3: Cloudy,
  45: CloudFog,
  48: CloudFog,
  51: CloudDrizzle,
  53: CloudDrizzle,
  55: CloudDrizzle,
  56: CloudDrizzle,
  57: CloudDrizzle,
  61: CloudRain,
  63: CloudRain,
  65: CloudRainWind,
  66: CloudRain,
  67: CloudRainWind,
  71: CloudSnow,
  73: CloudSnow,
  75: Snowflake,
  77: Snowflake,
  80: CloudDrizzle,
  81: CloudRain,
  82: CloudRainWind,
  85: CloudDrizzle,
  86: CloudSnow,
  95: CloudLightning,
  96: CloudLightning,
  99: Tornado,
};

const iconColors = {
  0: "#fbbf24",
  1: "#fbbf24",
  2: "#f8fafc",
  3: "#cbd5e1",
  45: "#cbd5e1",
  48: "#cbd5e1",
  51: "#7dd3fc",
  53: "#60a5fa",
  55: "#3b82f6",
  56: "#7dd3fc",
  57: "#60a5fa",
  61: "#60a5fa",
  63: "#3b82f6",
  65: "#2563eb",
  66: "#38bdf8",
  67: "#0ea5e9",
  71: "#e0f2fe",
  73: "#bae6fd",
  75: "#7dd3fc",
  77: "#dbeafe",
  80: "#60a5fa",
  81: "#3b82f6",
  82: "#2563eb",
  85: "#7dd3fc",
  86: "#3b82f6",
  95: "#a78bfa",
  96: "#8b5cf6",
  99: "#6d28d9",
};

/** Neutral slate for the "condition not reported" icon. */
const UNKNOWN_ICON_COLOR = "#94a3b8";

export default function WeatherIcon({ code, size = 24, className = "", animated = false }) {
  const weatherCode = toFiniteNumber(code);
  const normalizedCode = weatherCode !== null ? Math.trunc(weatherCode) : null;
  const parsedSize = toFiniteNumber(size);
  const iconSize = parsedSize !== null && parsedSize > 0 ? parsedSize : 24;
  const safeClassName = typeof className === "string" ? className : "";

  // A missing or unrecognised code must not borrow code 0's sun icon:
  // that would render "no reading" as "clear sky".
  const isUnknown = normalizedCode === null || !(normalizedCode in iconMap);
  const Icon = isUnknown ? CloudOff : iconMap[normalizedCode];
  const color = isUnknown ? UNKNOWN_ICON_COLOR : iconColors[normalizedCode];
  const isSunny = normalizedCode === 0 || normalizedCode === 1;
  const isCloudy = [2, 3, 45, 48].includes(normalizedCode);
  const animatedVariant = isSunny
    ? "weather-icon--sun"
    : isCloudy
      ? "weather-icon--cloud"
      : "";

  return (
    <Icon
      size={iconSize}
      className={`weather-icon ${animated ? `weather-icon--animated ${animatedVariant}` : ""} ${safeClassName}`}
      style={{ color }}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );
}
