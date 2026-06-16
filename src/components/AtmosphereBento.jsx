// src/components/AtmosphereBento.jsx
import { memo, useId } from "react";
import { Wind, Droplets, Sun, Eye, Moon, Gauge, Thermometer } from "lucide-react";
import { getAqiStatus, getUvStatus } from "../domain/exposure";
import { formatWindSpeed, windDirectionName, classifyWind } from "../domain/wind";
import { classifyComfort } from "../domain";
import { convertTemp } from "../utils/temperature";
import { toFiniteNumber } from "../utils/numbers";
import "./AtmosphereBento.css";

const ARC_PATH = "M8 50 A44 44 0 0 1 92 50";
const ARC_LEN = 138;

function ArcGauge({ fraction, color, ariaLabel, missing }) {
  const filled = !missing && Number.isFinite(fraction) && fraction > 0;
  const dashFill = filled
    ? `${Math.min(Math.round(fraction * ARC_LEN), ARC_LEN)} 200`
    : undefined;
  return (
    <svg viewBox="0 0 100 56" className="atm-arc-svg" role="img" aria-label={ariaLabel}>
      <path
        d={ARC_PATH}
        fill="none"
        stroke={missing ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.16)"}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={missing ? "2 9" : undefined}
      />
      {filled && (
        <path
          d={ARC_PATH}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={dashFill}
        />
      )}
    </svg>
  );
}

function HumidityTile({ humidity }) {
  const h = toFiniteNumber(humidity);
  const hasDat = h !== null;
  const fraction = hasDat ? Math.max(0, Math.min(1, h / 100)) : null;
  const label = hasDat
    ? h >= 70 ? "High" : h >= 40 ? "Moderate" : "Low"
    : "Unavailable";
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <div className="atm-label">
        <Droplets size={13} aria-hidden="true" />
        Humidity
      </div>
      <ArcGauge
        fraction={fraction}
        color="#7fb2e8"
        missing={!hasDat}
        ariaLabel={hasDat ? `Humidity ${Math.round(h)} percent ${label}` : "Humidity unavailable"}
      />
      <div className="atm-arc-readout">
        <span className="atm-val">{hasDat ? `${Math.round(h)}%` : "—"}</span>
        <span className="atm-sub">{label}</span>
      </div>
    </div>
  );
}

function UvTile({ uvIndex }) {
  const uv = toFiniteNumber(uvIndex);
  const hasDat = uv !== null;
  const fraction = hasDat ? Math.max(0, Math.min(1, uv / 11)) : null;
  const { label, color } = getUvStatus(uv);
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <div className="atm-label">
        <Sun size={13} aria-hidden="true" />
        UV index
      </div>
      <ArcGauge
        fraction={fraction}
        color={color}
        missing={!hasDat}
        ariaLabel={hasDat ? `UV index ${Math.round(uv)} ${label}` : "UV index unavailable"}
      />
      <div className="atm-arc-readout">
        <span className="atm-val">{hasDat ? Math.round(uv) : "—"}</span>
        <span className="atm-sub">{hasDat ? label : "Unavailable"}</span>
      </div>
    </div>
  );
}

function AqiTile({ aqi }) {
  const aqiVal = toFiniteNumber(aqi);
  const hasDat = aqiVal !== null;
  const fraction = hasDat ? Math.max(0, Math.min(1, aqiVal / 500)) : null;
  const { label, color } = getAqiStatus(aqiVal);
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <div className={`atm-label${hasDat ? "" : " atm-label--dim"}`}>
        <Wind size={13} aria-hidden="true" />
        Air quality
      </div>
      <ArcGauge
        fraction={fraction}
        color={color}
        missing={!hasDat}
        ariaLabel={
          hasDat
            ? `Air quality index ${Math.round(aqiVal)} ${label}`
            : "Air quality unavailable"
        }
      />
      <div className="atm-arc-readout">
        <span className={`atm-val${hasDat ? "" : " atm-val--dim"}`}>
          {hasDat ? Math.round(aqiVal) : "—"}
        </span>
        <span className="atm-sub">{hasDat ? label : "Unavailable"}</span>
      </div>
      {!hasDat && <p className="atm-missing-note">Not reported here</p>}
    </div>
  );
}

function PressureTile({ pressureHpa, unit }) {
  const hpa = toFiniteNumber(pressureHpa);
  const hasDat = hpa !== null;
  const fraction = hasDat ? Math.max(0, Math.min(1, (hpa - 960) / 80)) : null;
  const displayValue = hasDat
    ? unit === "C"
      ? `${Math.round(hpa)}`
      : (hpa * 0.02953).toFixed(2)
    : "—";
  const displayUnit = unit === "C" ? "hPa" : "in";
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <div className="atm-label">
        <Gauge size={13} aria-hidden="true" />
        Pressure
      </div>
      <ArcGauge
        fraction={fraction}
        color="#a88cf5"
        missing={!hasDat}
        ariaLabel={
          hasDat
            ? `Pressure ${displayValue} ${displayUnit}`
            : "Pressure unavailable"
        }
      />
      <div className="atm-arc-readout">
        <span className="atm-val atm-val--pressure">{displayValue}</span>
        <span className="atm-sub">{displayUnit}</span>
      </div>
    </div>
  );
}

function WindTile({ weather, unit }) {
  const current = weather?.current ?? {};
  const speed = toFiniteNumber(current.windSpeed);
  const gust = toFiniteNumber(current.windGust);
  const dir = toFiniteNumber(current.windDirection);
  const hasDat = speed !== null;
  const dirName = dir !== null ? windDirectionName(dir) : "";
  const strength = hasDat ? classifyWind(speed, "F") : "—";
  const speedDisplay = hasDat ? formatWindSpeed(speed, unit) : "—";
  const gustDisplay = gust !== null ? formatWindSpeed(gust, unit) : speedDisplay;
  const compassRotation = dir !== null ? dir + 180 : 0;
  return (
    <div className="atm-tile atm-tile--wide">
      <div className="atm-tile-row">
        <div className="atm-label">
          <Wind size={13} aria-hidden="true" />
          Wind
        </div>
        <span className="atm-sub">{strength}</span>
      </div>
      <div className="atm-wind-body">
        <svg
          viewBox="0 0 80 80"
          className="atm-compass"
          role="img"
          aria-label={dir !== null ? `Wind from ${dirName}` : "Wind direction unavailable"}
        >
          <circle cx="40" cy="40" r="31" fill="rgba(111,183,242,.08)" stroke="rgba(255,255,255,.2)" strokeWidth="1.4" />
          <text x="40" y="14" fill="rgba(238,241,248,.5)" fontSize="9" textAnchor="middle" fontFamily="Inter">N</text>
          {dir !== null && (
            <g transform={`rotate(${compassRotation} 40 40)`}>
              <line x1="40" y1="23" x2="40" y2="57" stroke="#6fb7f2" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M40 21 l-5 9 l10 0 z" fill="#6fb7f2" />
            </g>
          )}
        </svg>
        <div>
          <div>
            <span className="atm-val">{speedDisplay}</span>
            {dirName && <span className="atm-sub"> {dirName}</span>}
          </div>
          <div className="atm-sub atm-wind-gust">
            {"Gusts to "}
            <span style={{ color: "#eef1f8" }}>{gustDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSunTime(d) {
  if (!d || !Number.isFinite(d.getTime())) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function SunTile({ sunrise, sunset }) {
  const riseDate = sunrise ? new Date(sunrise) : null;
  const setDate = sunset ? new Date(sunset) : null;
  const hasDat =
    riseDate !== null && Number.isFinite(riseDate.getTime()) &&
    setDate !== null && Number.isFinite(setDate.getTime());

  let sunCx = 140, sunCy = 28;
  if (hasDat) {
    const now = Date.now();
    const t = Math.max(0, Math.min(1, (now - riseDate.getTime()) / (setDate.getTime() - riseDate.getTime())));
    sunCx = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 140 + t * t * 266;
    sunCy = (1 - t) * (1 - t) * 58 + 2 * (1 - t) * t * (-8) + t * t * 58;
  }

  return (
    <div className="atm-tile atm-tile--wide">
      <div className="atm-tile-row">
        <div className="atm-label">
          <Sun size={13} aria-hidden="true" />
          Sun
        </div>
        {hasDat && <span className="atm-sub atm-sub--sm">daylight arc</span>}
      </div>
      <svg
        viewBox="0 0 280 70"
        className="atm-sun-arc"
        role="img"
        aria-label={
          hasDat
            ? `Sunrise ${formatSunTime(riseDate)}, sunset ${formatSunTime(setDate)}`
            : "Sunrise and sunset unavailable"
        }
      >
        <line x1="8" y1="58" x2="272" y2="58" stroke="rgba(255,255,255,.16)" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M14 58 Q140 -8 266 58" fill="none" stroke="rgba(243,183,101,.5)" strokeWidth="1.6" strokeDasharray="3 3" />
        {hasDat && (
          <>
            <circle cx={sunCx.toFixed(1)} cy={sunCy.toFixed(1)} r="8" fill="#f3b765" />
            <circle cx={sunCx.toFixed(1)} cy={sunCy.toFixed(1)} r="13" fill="none" stroke="rgba(243,183,101,.35)" strokeWidth="1.6" />
          </>
        )}
      </svg>
      <div className="atm-sun-times">
        <span>{formatSunTime(riseDate)}</span>
        <span>{formatSunTime(setDate)}</span>
      </div>
    </div>
  );
}

function DewPointTile({ dewPoint, unit }) {
  const dp = toFiniteNumber(dewPoint);
  const hasDat = dp !== null;
  const dpConverted = hasDat ? convertTemp(dp, unit) : null;
  const displayValue = dpConverted !== null ? `${Math.round(dpConverted)}°` : "—";
  const comfort = hasDat ? classifyComfort(dp, "F") : null;
  return (
    <div className="atm-tile atm-tile--wide">
      <div className="atm-tile-row">
        <div className="atm-label">
          <Thermometer size={13} aria-hidden="true" />
          Dew point · comfort
        </div>
        {comfort && <span className="atm-sub">{comfort.level}</span>}
      </div>
      <div className="atm-dewpoint-body">
        <span className="atm-val atm-val--dew">{displayValue}</span>
        <div className="atm-dewpoint-scale">
          <div className="atm-dewpoint-bar">
            {hasDat && comfort && (
              <span
                className="atm-dewpoint-marker"
                style={{ left: `${comfort.position}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="atm-dewpoint-labels">
            <span>Dry</span>
            <span>Comfortable</span>
            <span>Muggy</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const VIS_BAR_HEIGHTS = [9, 13, 17, 21, 25, 28, 31, 34];
const VIS_BAR_XS = [2, 16, 30, 44, 58, 72, 86, 100];

function VisibilityTile({ visibility, unit }) {
  const visMeters = toFiniteNumber(visibility);
  const hasDat = visMeters !== null;
  const visMiles = hasDat ? visMeters / 1609.34 : null;
  const visKm = hasDat ? visMeters / 1000 : null;
  const visDisplay = unit === "C" ? visKm : visMiles;
  const displayVal = hasDat
    ? visDisplay >= 10 ? String(Math.round(visDisplay)) : visDisplay.toFixed(1)
    : "—";
  const displayUnit = unit === "C" ? "km" : "mi";
  const qualityLabel = !hasDat ? "" : visDisplay >= 10 ? "clear" : visDisplay >= 5 ? "hazy" : "poor";
  const maxVis = unit === "C" ? 15 : 10;
  const filledBars = hasDat
    ? Math.max(1, Math.min(8, Math.round((visDisplay / maxVis) * 8)))
    : 0;
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <div className="atm-label">
        <Eye size={13} aria-hidden="true" />
        Visibility
      </div>
      <svg
        viewBox="0 0 120 38"
        className="atm-vis-svg"
        role="img"
        aria-label={
          hasDat
            ? `Visibility ${displayVal} ${displayUnit} ${qualityLabel}`
            : "Visibility unavailable"
        }
      >
        {VIS_BAR_XS.map((x, i) => (
          <rect
            key={i}
            x={x}
            y={38 - VIS_BAR_HEIGHTS[i]}
            width="8"
            height={VIS_BAR_HEIGHTS[i]}
            rx="2"
            fill={i < filledBars ? "#6fb7f2" : "rgba(255,255,255,.12)"}
          />
        ))}
      </svg>
      <div>
        <span className="atm-val atm-val--vis">{displayVal}</span>
        {hasDat && <span className="atm-sub"> {displayUnit} · {qualityLabel}</span>}
      </div>
    </div>
  );
}

function MoonTile() {
  return (
    <div className="atm-tile atm-tile--missing atm-tile--center">
      <div className="atm-label">
        <Moon size={13} aria-hidden="true" />
        Moon
      </div>
      <svg
        viewBox="0 0 60 60"
        className="atm-moon-svg"
        role="img"
        aria-label="Moon phase not in forecast"
      >
        <circle cx="30" cy="30" r="20" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.18)" strokeWidth="1.2" />
      </svg>
      <div className="atm-sub atm-sub--moon">Not in forecast</div>
    </div>
  );
}

function AtmosphereBento({ weather, aqi, unit = "F", style, isRefreshing = false }) {
  const titleId = useId();
  return (
    <section
      className="bento-atm atm-bento glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="atm-header">
        <h3 id={titleId} className="atm-title">
          <Wind size={16} aria-hidden="true" />
          <span>Atmosphere</span>
        </h3>
      </header>

      <div className="atm-grid">
        <HumidityTile humidity={weather?.current?.humidity} />
        <UvTile uvIndex={weather?.daily?.uvIndexMax?.[0]} />
        <AqiTile aqi={aqi} />
        <PressureTile pressureHpa={weather?.current?.pressure} unit={unit} />
        <WindTile weather={weather} unit={unit} />
        <SunTile
          sunrise={weather?.daily?.sunrise?.[0]}
          sunset={weather?.daily?.sunset?.[0]}
        />
        <DewPointTile dewPoint={weather?.current?.dewPoint} unit={unit} />
        <VisibilityTile visibility={weather?.current?.visibility} unit={unit} />
        <MoonTile />
      </div>
    </section>
  );
}

export default memo(AtmosphereBento);
