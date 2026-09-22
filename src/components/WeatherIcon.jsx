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
  0: "var(--wx-clear)",
  1: "var(--wx-clear)",
  2: "var(--wx-cloud-light)",
  3: "var(--wx-cloud)",
  45: "var(--wx-cloud)",
  48: "var(--wx-cloud)",
  51: "var(--wx-precip-light)",
  53: "var(--wx-precip)",
  55: "var(--wx-precip-heavy)",
  56: "var(--wx-precip-light)",
  57: "var(--wx-precip)",
  61: "var(--wx-precip)",
  63: "var(--wx-precip-heavy)",
  65: "var(--wx-precip-extreme)",
  66: "var(--wx-freezing-light)",
  67: "var(--wx-freezing)",
  71: "var(--wx-snow-light)",
  73: "var(--wx-snow)",
  75: "var(--wx-precip-light)",
  77: "var(--wx-snow-grains)",
  80: "var(--wx-precip)",
  81: "var(--wx-precip-heavy)",
  82: "var(--wx-precip-extreme)",
  85: "var(--wx-precip-light)",
  86: "var(--wx-precip-heavy)",
  95: "var(--wx-storm)",
  96: "var(--wx-storm-hail)",
  99: "var(--wx-tornado)",
};

/** Neutral slate for the "condition not reported" icon. */
const UNKNOWN_ICON_COLOR = "var(--wx-unknown)";

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
