// src/components/AtmosphereBento.jsx
import { memo, useId } from "react";
import { Wind, Droplets, Sun, Eye, Gauge, Thermometer } from "lucide-react";
import { getAqiStatus, getAqiGuidance, getUvStatus } from "../domain/exposure";
import { InfoDrawer } from "./ui";
import { formatWindSpeed, windDirectionName, classifyWind } from "../domain/wind";
import { classifyComfort } from "../domain";
import { convertTemp } from "../utils/temperature";
import { toFiniteNumber, MISSING_VALUE_PLACEHOLDER } from "../utils/numbers";
import { getDaylightProgress } from "../utils/sunlight";
import { useTimeNow } from "../hooks/useTimeNow";
import "./AtmosphereBento.css";

const ARC_PATH = "M8 50 A44 44 0 0 1 92 50";
const ARC_LEN = 138;

/*
 * `scale` and `tone` together pick the fill colour, in CSS. Both are needed:
 * UV and AQI each have a "moderate" tone and they are not required to agree,
 * so a tone alone would silently couple two independent scales.
 *
 * A `var()` cannot be used in an SVG presentation attribute, so the fill is
 * given a class and styled in AtmosphereBento.css rather than passed a hex.
 */
function ArcGauge({ fraction, scale, tone, ariaLabel, missing }) {
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
          className="atm-arc-fill"
          data-scale={scale}
          data-tone={tone}
          d={ARC_PATH}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={dashFill}
        />
      )}
    </svg>
  );
}

/*
 * Every tile was a bare gauge: a number, a word, a coloured arc, and no way to
 * find out what any of it meant. Dew point and pressure in particular are
 * readings most people cannot act on without being told what they imply.
 *
 * The explanation is opt-in, behind the same InfoDrawer that MetricCard already
 * uses elsewhere in this codebase, so the scannable surface stays scannable.
 * Each entry says what the reading is and what a reader should do with it —
 * enough to teach, short enough not to become a second dashboard.
 */
const TILE_HELP = {
  humidity: {
    title: "Humidity",
    body: "The share of moisture the air is holding, as a percentage of the most it could hold at this temperature. High humidity slows how fast sweat evaporates, which is why a humid 80° feels hotter than a dry one.",
  },
  uv: {
    title: "UV index",
    body: "How strong the sun's ultraviolet radiation is right now, from 0 to 11+. At 3 or above, unprotected skin can start to burn — 6 to 7 in under half an hour for fair skin. Shade, a hat and sunscreen all move the number that matters.",
  },
  aqi: {
    title: "Air quality index",
    body: "The US EPA's index for how polluted the air is, from 0 to 500. Below 50 is clean; above 100, people with asthma or heart and lung conditions start to feel it; above 150 it affects everyone. The line under the number says what to do about it.",
  },
  pressure: {
    title: "Barometric pressure",
    body: "The weight of the atmosphere overhead. The absolute number matters less than which way it is moving: falling pressure usually means unsettled weather approaching, rising pressure means it is clearing.",
  },
  wind: {
    title: "Wind",
    body: "Sustained speed with the direction it blows from, plus the peak gust. Gusts are what knock over garden furniture and make cycling unpleasant, so they are worth more of your attention than the sustained figure.",
  },
  sun: {
    title: "Sunrise and sunset",
    body: "Today's sunrise and sunset for this location, with the arc showing where the sun currently sits between them. Useful light lingers for roughly half an hour past sunset.",
  },
  dewPoint: {
    title: "Dew point",
    body: "The temperature the air would need to cool to before moisture condenses out of it. It tracks how muggy the air feels far better than humidity does: below 50° feels dry, above 60° feels sticky, above 70° feels oppressive whatever the humidity reads.",
  },
  visibility: {
    title: "Visibility",
    body: "How far you can see before haze, fog or precipitation obscures things. Ten miles is a clear day. Under about a mile is fog dense enough to slow driving.",
  },
};

/*
 * The label row: icon, text, and an optional help drawer pinned to the right.
 * `dim` preserves the missing-data variant the AQI tile uses.
 */
function TileLabel({ icon: Icon, help, dim = false, children }) {
  return (
    <div className="atm-label-row">
      <div className={`atm-label${dim ? " atm-label--dim" : ""}`}>
        <Icon size={13} aria-hidden="true" />
        {children}
      </div>
      {help && (
        <InfoDrawer
          label={`About ${help.title}`}
          title={help.title}
          className="atm-help-drawer"
        >
          {help.body}
        </InfoDrawer>
      )}
    </div>
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
      <TileLabel icon={Droplets} help={TILE_HELP.humidity}>
        Humidity
      </TileLabel>
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
  const { label, tone } = getUvStatus(uv);
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <TileLabel icon={Sun} help={TILE_HELP.uv}>
        UV index
      </TileLabel>
      <ArcGauge
        fraction={fraction}
        scale="uv"
        tone={tone}
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
  const { label, tone } = getAqiStatus(aqiVal);
  return (
    <div className={`atm-tile${hasDat ? "" : " atm-tile--missing"}`}>
      <TileLabel icon={Wind} help={TILE_HELP.aqi} dim={!hasDat}>
        Air quality
      </TileLabel>
      <ArcGauge
        fraction={fraction}
        scale="aqi"
        tone={tone}
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
      {/*
        The number and its EPA label answer "how bad is it". This answers
        "so what do I do", which is the question a reader actually has. Only
        rendered when there is a reading: a missing AQI is not a safe AQI.
      */}
      {hasDat && <p className="atm-guidance">{getAqiGuidance(aqiVal)}</p>}
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
      <TileLabel icon={Gauge} help={TILE_HELP.pressure}>
        Pressure
      </TileLabel>
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
  // A missing gust is not the sustained speed. Falling back to speedDisplay
  // printed "Gusts to 12 mph" from wind_speed_10m when wind_gusts_10m was
  // absent — a fabricated reading presented as measured, which is the one
  // thing the trust contract forbids. Every sibling tile drops to "—" here.
  const gustDisplay =
    gust !== null ? formatWindSpeed(gust, unit) : MISSING_VALUE_PLACEHOLDER;
  const compassRotation = dir !== null ? dir + 180 : 0;
  return (
    <div className="atm-tile atm-tile--wide">
      <div className="atm-tile-row">
        <TileLabel icon={Wind} help={TILE_HELP.wind}>
          Wind
        </TileLabel>
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
          <text x="40" y="14" fill="rgba(238, 241, 248, 0.78)" fontSize="9" textAnchor="middle" fontFamily="Inter">N</text>
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

function SunTile({ sunrise, sunset, timeZone }) {
  const nowMs = useTimeNow(60_000);
  const riseDate = sunrise ? new Date(sunrise) : null;
  const setDate = sunset ? new Date(sunset) : null;
  const hasDat =
    riseDate !== null && Number.isFinite(riseDate.getTime()) &&
    setDate !== null && Number.isFinite(setDate.getTime());

  // Sunrise/sunset are naive location-local strings, so "now" must be
  // reframed into the location's wall clock before comparing — the raw
  // device epoch pins the bead to an arc end for remote cities.
  const progress = getDaylightProgress(sunrise, sunset, nowMs, timeZone);
  const showSun = progress !== null;
  let sunCx = 140, sunCy = 28;
  if (showSun) {
    const t = progress;
    sunCx = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * 140 + t * t * 266;
    sunCy = (1 - t) * (1 - t) * 58 + 2 * (1 - t) * t * (-8) + t * t * 58;
  }

  return (
    <div className="atm-tile atm-tile--wide">
      <div className="atm-tile-row">
        <TileLabel icon={Sun} help={TILE_HELP.sun}>
          Sun
        </TileLabel>
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
        {showSun && (
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
        <TileLabel icon={Thermometer} help={TILE_HELP.dewPoint}>
          Dew point · comfort
        </TileLabel>
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
      <TileLabel icon={Eye} help={TILE_HELP.visibility}>
        Visibility
      </TileLabel>
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

function AtmosphereBento({ weather, aqi, unit = "F", style, isRefreshing = false }) {
  const titleId = useId();

  // Individual tiles already say "Unavailable", but nothing told the
  // reader what the dash itself means. Explain it once, and only when a
  // dash is actually on screen.
  const hasMissingReading = [
    weather?.current?.humidity,
    weather?.daily?.uvIndexMax?.[0],
    aqi,
    weather?.current?.pressure,
    weather?.current?.dewPoint,
    weather?.current?.visibility,
  ].some((reading) => toFiniteNumber(reading) === null);

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
          timeZone={weather?.meta?.timezone}
        />
        <DewPointTile dewPoint={weather?.current?.dewPoint} unit={unit} />
        <VisibilityTile visibility={weather?.current?.visibility} unit={unit} />
      </div>

      {hasMissingReading && (
        // "the provider", not "this station": these readings come from a
        // forecast model (Open-Meteo), not a weather station on the corner.
        // Naming the wrong source in the sentence that explains our data
        // honesty would be a small lie inside the honesty message itself.
        <p className="atm-footnote">
          {MISSING_VALUE_PLACEHOLDER} means the provider didn&rsquo;t report that
          reading. It isn&rsquo;t a zero.
        </p>
      )}
    </section>
  );
}

export default memo(AtmosphereBento);
