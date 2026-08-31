// src/components/StormWatch.jsx
//
// Storm watch — a risk *synthesis*, not a second gauge panel.
// Keeps only what's unique to it: storm-risk level + the 4-segment
// indicator, CAPE (the convective "storm fuel" reading) on a Calm→Explosive
// scale, a peak-window pill tied to the rain peak, and a plain-English
// why-line that NAMES the drivers (pressure, dew point, wind) in prose.
// Pressure / Wind / Dew-point gauges live in the Atmosphere bento, not here.

import { memo, useId, useMemo } from "react";
import { Zap, Clock } from "lucide-react";
import {
  classifyStormRisk,
  calculatePressureTrend,
  classifyComfort,
  classifyWind,
} from "../domain";
import { getZonedNow, formatHour } from "../utils/dates";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber, MISSING_VALUE_PLACEHOLDER } from "../utils/numbers";
import { InfoDrawer } from "./ui";
import "./StormWatch.css";

const CAPE_MAX = 4000; // J/kg — top of the Calm→Explosive scale

// Storm-risk scores map 1:1 onto the app-wide severity scale
// (App.css .severity-badge--*), so Storm Watch speaks the same
// Low/Moderate/High/Severe language as Nowcast and Alerts rather than a
// private "Level N of 4" vocabulary. Indexed by risk.score (0–4).
const STORM_RISK_SEVERITY_TONE = [
  "minimal",
  "low",
  "moderate",
  "high",
  "critical",
];

function capeScalePct(cape) {
  return Math.max(0, Math.min(1, cape / CAPE_MAX)) * 100;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Peak storm/rain window over the next ~12h, derived from hourly rain chance.
function buildPeakWindow(hourly, timeZone) {
  const t = hourly?.time;
  const r = hourly?.rainChance;
  if (!Array.isArray(t) || !Array.isArray(r) || !t.length) return null;
  const now = getZonedNow(timeZone).getTime();
  const pts = [];
  for (let i = 0; i < t.length; i++) {
    const tm = new Date(t[i]).getTime();
    if (!Number.isFinite(tm)) continue;
    if (tm < now - 3600000) continue;
    if (tm > now + 12 * 3600000) break;
    const p = toFiniteNumber(r[i]);
    if (p !== null) pts.push({ tm, p });
  }
  if (!pts.length) return null;
  const peak = pts.reduce((a, b) => (b.p > a.p ? b : a));
  if (peak.p < 40) return { none: true };
  const thr = Math.max(40, peak.p * 0.6);
  const hi = pts.filter((x) => x.p >= thr);
  const s = hi[0].tm;
  const e = hi[hi.length - 1].tm;
  const label =
    s === e
      ? formatHour(new Date(s))
      : `${formatHour(new Date(s))}–${formatHour(new Date(e))}`;
  return { none: false, label, peakP: Math.round(peak.p) };
}

// Plain-English synthesis: name the drivers in prose; never draw their gauges.
function buildWhyLine(weather, risk, hasCape) {
  // The location's zone keeps the "now" anchor on the location's wall
  // clock; without it a saved city hours away reads the wrong sample.
  const pressure = calculatePressureTrend(
    weather?.hourly?.pressure,
    weather?.hourly?.time,
    { timeZone: weather?.meta?.timezone }
  );
  const dew = toFiniteNumber(weather?.current?.dewPoint);
  const comfort = dew !== null ? classifyComfort(dew, "F") : null;
  const wind = toFiniteNumber(weather?.current?.windSpeed);
  const windClass = wind !== null ? classifyWind(wind, "F") : null;

  const drivers = [];
  if (pressure?.direction === "falling") drivers.push("falling pressure");
  else if (pressure?.direction === "rising") drivers.push("rising pressure");
  if (comfort && /mugg|oppress|humid|sticky/i.test(comfort.level)) {
    drivers.push("a muggy dew point");
  }
  if (windClass && /(strong|gale|high|damaging|severe|storm)/i.test(String(windClass))) {
    drivers.push("gusty winds");
  }

  const active = hasCape && risk.score > 0;
  if (active) {
    if (drivers.length) {
      return `${cap(joinList(drivers))} ${drivers.length > 1 ? "are" : "is"} feeding today's storm risk.`;
    }
    return "Elevated storm energy aloft, with no single surface driver standing out.";
  }
  if (!hasCape) {
    return "Live storm-energy data is unavailable, so risk can't be assessed right now.";
  }
  if (drivers.length) {
    return `${cap(joinList(drivers))}, but limited storm energy keeps the risk low.`;
  }
  return "Stable pressure and comfortable air — no storm signal in the current air mass.";
}

function StormWatch({ weather, unit, style, isRefreshing = false }) {
  void unit; // retained for API parity; synthesis works in domain units
  const titleId = useId();
  const whyId = useId();

  /*
   * The forecast request carries past_hours=48, so hourly index 0 is two
   * days in the past — reading cape[0] rendered storm energy from 48 hours
   * ago as "live storm energy", which could headline "Severe" on a calm day
   * (or "All clear" during a real build-up). Anchor to now the way
   * HourlyCard and analyzeNowcast already do.
   */
  const cape = useMemo(() => {
    const times = weather?.hourly?.time;
    const capeSeries = weather?.hourly?.cape;
    if (!Array.isArray(times) || !Array.isArray(capeSeries)) {
      return null;
    }
    const nowIdx = findWindowStartIndex(times, {
      now: getZonedNow(weather?.meta?.timezone).getTime(),
      currentSlotToleranceMs: 60 * 60 * 1000,
    });
    if (nowIdx < 0) {
      return null;
    }
    return toFiniteNumber(capeSeries[nowIdx]);
  }, [weather?.hourly?.time, weather?.hourly?.cape, weather?.meta?.timezone]);
  const hasCape = cape !== null;
  const conditionCode = toFiniteNumber(weather?.current?.conditionCode);
  const risk = useMemo(
    () => classifyStormRisk(hasCape ? cape : 0, conditionCode),
    [hasCape, cape, conditionCode]
  );
  const active = hasCape && risk.score > 0;
  const stormTone = STORM_RISK_SEVERITY_TONE[risk.score] ?? "minimal";

  const win = useMemo(
    () => buildPeakWindow(weather?.hourly, weather?.meta?.timezone),
    [weather?.hourly, weather?.meta?.timezone]
  );
  const why = useMemo(
    () => buildWhyLine(weather, risk, hasCape),
    [weather, risk, hasCape]
  );

  const headline = !hasCape
    ? "Reading unavailable"
    : active
      ? risk.level
      : "All clear";
  /*
   * The headline tone is the same vocabulary the badge beside it already
   * speaks, so the two can never disagree about the same reading. It used
   * to take a hex from classifyStormRisk — a second, drifting copy of the
   * saturated --risk-* ramp — through an inline style.
   * That ramp is built for the meter bars below, not for 26px text on the
   * card surface: measured against the real composited backdrop, "Severe"
   * (#dc2626) came out at 2.48:1, under even the 3:1 large-text floor, and
   * "High" (#f97316) at 4.28:1. The word telling a user a thunderstorm is
   * coming was the least legible text on the page, and got worse as the
   * risk rose. The --severity-*-fg rungs are the palette's text
   * foregrounds; every state now lands at 8.29:1 or better.
   */
  const headlineTone = !hasCape ? "unavailable" : stormTone;
  const summary = !hasCape
    ? "Live storm energy reading unavailable"
    : active
      ? `${risk.level} storm risk from live storm energy`
      : "No thunderstorm signal in the air mass";
  const eyebrow = !hasCape ? "Storm watch" : "All clear";

  return (
    <section
      className="bento-storm storm-watch glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      data-storm-active={active ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="storm-header">
        <div className="storm-header-main">
          <h3 id={titleId} className="storm-title">
            <Zap size={16} aria-hidden="true" />
            <span>Storm watch</span>
          </h3>
          <p className="storm-lede">Storm-risk synthesis for the hours ahead.</p>
        </div>
        {active ? (
          <span className={`severity-badge severity-badge--${stormTone}`}>
            {risk.level} risk
          </span>
        ) : (
          <span className="storm-subtitle eyebrow-pill">{eyebrow}</span>
        )}
      </header>

      <div className="storm-synth">
        <div className="storm-risk-block">
          <div className="storm-level" data-tone={headlineTone}>
            {headline}
          </div>
          <p className="storm-module-summary">{summary}</p>
          {active && (
            <div
              className="storm-risk-meter"
              data-tone={stormTone}
              aria-hidden="true"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="storm-risk-pip"
                  data-filled={i <= risk.score ? "true" : undefined}
                />
              ))}
            </div>
          )}

          <div className="cape-row">
            <span className="cape-label">
              <abbr
                title="Convective available potential energy"
                aria-label="CAPE, convective available potential energy"
              >
                Storm fuel · CAPE
              </abbr>
            </span>
            <span className={`cape-value${hasCape ? "" : " is-missing"}`}>
              {hasCape ? `${Math.round(cape)} J/kg` : MISSING_VALUE_PLACEHOLDER}
            </span>
            <InfoDrawer
              label="About CAPE storm energy"
              title="What CAPE means"
              className="storm-help-drawer"
            >
              CAPE estimates how much rising energy the atmosphere has for
              thunderstorms. Higher values can support stronger storm growth
              when other ingredients align.
            </InfoDrawer>
          </div>
          <div className="cape-scale" aria-hidden="true">
            <div className="cape-scale-track" />
            {hasCape && (
              <div
                className="cape-marker"
                style={{ left: `${capeScalePct(cape)}%` }}
              />
            )}
          </div>
          <div className="cape-scale-ends" aria-hidden="true">
            <span>Calm</span>
            <span>Explosive</span>
          </div>
        </div>

        <div className="storm-readout">
          {win && !win.none && (
            <div className="storm-window">
              <span className="storm-window-label">
                <Clock size={13} aria-hidden="true" />
                Peak window
              </span>
              <span className="storm-window-pill">{win.label}</span>
              <span className="storm-window-sub">{win.peakP}% peak rain chance</span>
            </div>
          )}
          <p className="storm-why" id={whyId}>
            {why}
          </p>
        </div>
      </div>
    </section>
  );
}

export default memo(StormWatch);
