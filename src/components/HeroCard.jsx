// src/components/HeroCard.jsx

import { memo, useId, useMemo } from "react";
import {
  MapPin,
  Wind,
  Droplets,
  Gauge,
  Thermometer,
  Sunrise,
  Sunset,
  Sun,
} from "lucide-react";
import { isMissingPlaceholder } from "../utils/numbers";
import { useTimeNow } from "../hooks/useTimeNow";
import WeatherIcon from "./WeatherIcon";
import { Stat } from "./ui";
import { buildHeroData } from "./heroCard/buildHeroData";
import "./HeroCard.css";

// Sunlight phase + day-name label only change a few times per day.
// A 5-minute bucket keeps the hero useMemo stable for most ticks
// while still rolling over at midnight and around sunrise/sunset.
const HERO_NOW_BUCKET_MS = 5 * 60_000;

const GUIDANCE_ICONS = {
  rain: Droplets,
  uv: Sun,
  wind: Wind,
};

function HeroCard({
  weather,
  location,
  unit,
  climateComparison,
  climateStatus = "idle",
  style,
  isRefreshing = false,
}) {
  // Subscribe directly at the 5-minute cadence so the dashboard does
  // not have to thread nowMs through every card. Sunlight phase, the
  // date label, and sunrise/sunset all transition slowly enough that
  // a 5-minute interval rolls over reliably across midnight without
  // re-rendering the hero every minute for an unchanged display.
  const nowMs = useTimeNow(HERO_NOW_BUCKET_MS);
  const headingId = useId();
  const nowBucket = Number.isFinite(nowMs)
    ? Math.floor(nowMs / HERO_NOW_BUCKET_MS)
    : null;
  const heroData = useMemo(
    () =>
      buildHeroData({
        weather,
        location,
        unit,
        climateComparison,
        nowMs: nowBucket === null ? null : nowBucket * HERO_NOW_BUCKET_MS,
      }),
    [weather, location, unit, climateComparison, nowBucket]
  );

  if (!heroData) {
    /*
     * buildHeroData returns null when weather.current is missing or
     * location is missing. HeroCard only renders after the app-level
     * AppLoadingState screen clears, so a null heroData at this
     * point is not a cold-start loading state — it's either a real
     * data-shape issue or a mid-flight retry where the prior payload
     * was cleared. Either way the trust contract says: name what's
     * missing, don't pretend to be loading. The body copy explicitly
     * mentions retry-on-next-refresh so the user understands this is
     * a transient state we'll recover from.
     */
    const fallbackLocationName =
      typeof location?.name === "string" && location.name.trim()
        ? location.name.trim()
        : "";
    const fallbackLocationCountry =
      typeof location?.country === "string" && location.country.trim()
        ? location.country.trim()
        : "";
    const hasResolvedLocation = Boolean(fallbackLocationName);
    const locationLabel = hasResolvedLocation
      ? `${fallbackLocationName}${
          fallbackLocationCountry ? `, ${fallbackLocationCountry}` : ""
        }`
      : "No location selected";
    const bodyCopy = hasResolvedLocation
      ? "Current readings aren’t available right now. Aura will retry on the next refresh."
      : "Pick a location to see live conditions. Use the search above or grant device location.";

    return (
      <section
        className="bento-hero hero-card glass hero-card--placeholder"
        style={style}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
        aria-labelledby={headingId}
      >
        <h3 id={headingId} className="sr-only">
          Current weather
        </h3>
        <header className="hero-meta">
          <div
            className="hero-location"
            aria-label={
              hasResolvedLocation
                ? `Location: ${locationLabel}`
                : "No location selected"
            }
          >
            <MapPin size={14} aria-hidden="true" />
            <span>{locationLabel}</span>
          </div>
          <p className="hero-date">
            {hasResolvedLocation
              ? "Readings unavailable"
              : "Choose a place to begin"}
          </p>
        </header>
        <p className="hero-placeholder-copy" role="status">
          {bodyCopy}
        </p>
      </section>
    );
  }

  const {
    current,
    info,
    safeLocationName,
    safeLocationCountry,
    currentTempDisplay,
    isCurrentTempMissing,
    feelsLikeDisplay,
    dewPointDisplay,
    todayHighDisplay,
    todayLowDisplay,
    windDisplay,
    humidityDisplay,
    pressureDisplay,
    heroStatsHaveAnyMissing,
    sunriseValue,
    sunsetValue,
    sunriseLabel,
    sunsetLabel,
    daylightLabel,
    sunlightPhase,
    atmosphereReading,
    hasClimateComparison,
    climateMessage,
    dailyGuidance,
    today,
    tempUnit,
  } = heroData;

  // Climate-context loading and unavailable states used to render a
  // placeholder sentence between the temperature and the bottom block,
  // talking to itself while the historical comparison resolved. The
  // audit flagged this as the hero "talking to itself" — supplemental
  // context should be silent when absent, not announce its absence.
  // Suppress fallback copy; only render the resolved insight.
  void climateStatus;

  const isHighMissing = isMissingPlaceholder(todayHighDisplay);
  const isLowMissing = isMissingPlaceholder(todayLowDisplay);

  const sunlightPhaseClass = sunlightPhase
    ? ` hero-card--phase-${sunlightPhase}`
    : "";

  return (
    <section
      className={`bento-hero hero-card glass${sunlightPhaseClass}`}
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      data-sunlight-phase={sunlightPhase || undefined}
      aria-busy={isRefreshing || undefined}
      aria-labelledby={headingId}
    >
      {/* Hidden heading so screen-reader users land on the hero card
          when navigating by heading. The h2 group label above ("Current
          Conditions") covers the section, and the visible hero presents
          the data — so this only needs to exist for assistive tech. */}
      <h3 id={headingId} className="sr-only">
        Current weather
        {safeLocationName ? ` in ${safeLocationName}` : ""}
      </h3>
      <header className="hero-meta">
        <div className="hero-location-block">
          <div
            className="hero-location"
            aria-label={`Location: ${safeLocationName}${safeLocationCountry ? `, ${safeLocationCountry}` : ""}`}
          >
            <MapPin size={14} aria-hidden="true" />
            <span>
              {safeLocationName}
              {safeLocationCountry ? `, ${safeLocationCountry}` : ""}
            </span>
          </div>
          <p className="hero-date">{today}</p>
        </div>
        <div
          className="hero-high-low"
          role="group"
          aria-label={
            isHighMissing && isLowMissing
              ? "Today's high and low temperatures unavailable"
              : "Today's high and low temperatures"
          }
        >
          <div className="hero-high-low-item">
            <span className="hero-high-low-label">High</span>
            <span
              className={`hero-high-low-value${
                isHighMissing ? " is-missing" : ""
              }`}
            >
              {isHighMissing ? (
                <span role="img" aria-label="No data available">
                  {todayHighDisplay}
                </span>
              ) : (
                todayHighDisplay
              )}
            </span>
          </div>
          <div className="hero-high-low-item">
            <span className="hero-high-low-label">Low</span>
            <span
              className={`hero-high-low-value${
                isLowMissing ? " is-missing" : ""
              }`}
            >
              {isLowMissing ? (
                <span role="img" aria-label="No data available">
                  {todayLowDisplay}
                </span>
              ) : (
                todayLowDisplay
              )}
            </span>
          </div>
        </div>
      </header>
      <div className="hero-main">
        <div className="hero-temp-block">
          <div className="hero-temp-row">
            <div
              className={`hero-temp${isCurrentTempMissing ? " is-missing" : ""}`}
              role={isCurrentTempMissing ? "img" : undefined}
              aria-label={
                isCurrentTempMissing
                  ? "Current temperature unavailable"
                  : undefined
              }
            >
              {isCurrentTempMissing ? (
                <span aria-hidden="true">{currentTempDisplay}</span>
              ) : (
                currentTempDisplay
              )}
              {!isCurrentTempMissing && (
                <span className="hero-temp-unit">{tempUnit}</span>
              )}
            </div>
            <div className="hero-icon">
              <WeatherIcon code={current.conditionCode} size={124} animated />
            </div>
          </div>
          <p className="hero-condition-line">
            <span className="hero-condition">{info.label}</span>
            <span className="hero-condition-separator" aria-hidden="true">·</span>
            <span className="hero-feels">Feels like {feelsLikeDisplay}</span>
          </p>
          {/*
           * Editorial atmosphere reading sits below the temperature
           * block instead of above it. The user lands on the gestalt
           * (number + condition + feels-like) first; the synthesised
           * sentence becomes context, not gating copy. Earned: only
           * renders when buildAtmosphereReading found a signal worth
           * the line; baseline returns null so we render nothing.
           */}
          {atmosphereReading && (
            <p
              className={`hero-reading hero-reading--${atmosphereReading.tone}`}
              role="status"
            >
              {atmosphereReading.text}
            </p>
          )}
          {hasClimateComparison && (
            <p className="hero-insight">{climateMessage}</p>
          )}
        </div>
      </div>

      <div className="hero-bottom">
        <div className="hero-bottom-left">
          {Array.isArray(dailyGuidance) && dailyGuidance.length > 0 && (
            <ul className="hero-guidance" aria-label="Daily guidance">
              {dailyGuidance.map((item) => {
                const Icon = GUIDANCE_ICONS[item.kind] ?? Sun;
                return (
                  <li
                    key={item.kind}
                    className={`hero-guidance-item hero-guidance-item--${item.tone}`}
                  >
                    <div className="hero-guidance-icon">
                      <Icon size={15} aria-hidden="true" />
                    </div>
                    <div className="hero-guidance-copy">
                      <span className="hero-guidance-label">{item.label}</span>
                      <strong className="hero-guidance-value">{item.value}</strong>
                      <span className="hero-guidance-detail">{item.detail}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            className="hero-sunlight-line"
            role="group"
            aria-label={`Sunrise ${sunriseLabel}, sunset ${sunsetLabel}, ${daylightLabel} of daylight`}
          >
            <span className="hero-sunlight-segment">
              <Sunrise size={13} aria-hidden="true" />
              <time dateTime={sunriseValue || undefined}>{sunriseLabel}</time>
            </span>
            <span className="hero-sunlight-separator" aria-hidden="true">·</span>
            <span className="hero-sunlight-segment">
              <Sunset size={13} aria-hidden="true" />
              <time dateTime={sunsetValue || undefined}>{sunsetLabel}</time>
            </span>
            <span className="hero-sunlight-separator" aria-hidden="true">·</span>
            <span className="hero-sunlight-segment">
              <Sun size={13} aria-hidden="true" />
              <span>{daylightLabel}</span>
            </span>
          </div>
        </div>

        <div className="hero-stats" role="group" aria-label="Current readings">
          <Stat
            icon={<Wind size={18} />}
            label="Wind"
            value={windDisplay}
          />
          <Stat
            icon={<Droplets size={18} />}
            label="Humidity"
            value={humidityDisplay}
          />
          <Stat
            icon={<Gauge size={18} />}
            label="Pressure"
            value={pressureDisplay}
          />
          <Stat
            icon={<Thermometer size={18} />}
            label="Dew Point"
            value={dewPointDisplay}
          />
        </div>
      </div>

      {heroStatsHaveAnyMissing && (
        <p className="hero-stats-note" role="status">
          Some readings are unavailable from the provider. Aura shows
          “—” instead of a fallback value to keep the rest of the
          forecast trustworthy.
        </p>
      )}
    </section>
  );
}

export default memo(HeroCard);
