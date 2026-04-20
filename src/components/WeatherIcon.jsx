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
} from "lucide-react";
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
  61: CloudRain,
  63: CloudRain,
  65: CloudRainWind,
  71: CloudSnow,
  73: CloudSnow,
  75: Snowflake,
  80: CloudDrizzle,
  81: CloudRain,
  82: CloudRainWind,
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
  61: "#60a5fa",
  63: "#3b82f6",
  65: "#2563eb",
  71: "#e0f2fe",
  73: "#bae6fd",
  75: "#7dd3fc",
  80: "#60a5fa",
  81: "#3b82f6",
  82: "#2563eb",
  95: "#a78bfa",
  96: "#8b5cf6",
  99: "#6d28d9",
};

export default function WeatherIcon({ code, size = 24, className = "", animated = false }) {
  const weatherCode = Number(code);
  const normalizedCode = Number.isFinite(weatherCode) ? Math.trunc(weatherCode) : 0;
  const iconSize = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 24;
  const safeClassName = typeof className === "string" ? className : "";

  const Icon = iconMap[normalizedCode] || iconMap[0];
  const color = iconColors[normalizedCode] || iconColors[0];
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
