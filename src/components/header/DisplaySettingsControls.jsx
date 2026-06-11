import { memo, useEffect, useRef, useState } from "react";

const CLIMATE_CONTEXT_LABEL_ID = "climate-context-label";
const ANNOUNCEMENT_CLEAR_MS = 3500;

function DisplaySettingsControls({
  id = "display-settings-panel",
  isMobileOpen = false,
  showClimateContext,
  onEnableClimateContext,
  onDisableClimateContext,
  unit,
  onSetUnitF,
  onSetUnitC,
  onClearSavedLocation,
  hasPersistedLocation,
}) {
  // Toggling unit or climate context updates every Stat, Hero reading,
  // and chart value across the dashboard, but the cascading content
  // change is silent to a screen reader. Each toggle button already
  // announces its own aria-pressed flip — we add a single SR-only
  // confirmation so the user knows the change took effect. Mirrors the
  // "Weather updated." pattern in StatusStack: track previous values
  // in refs, derive the message, schedule a clear-out.
  const [announcement, setAnnouncement] = useState("");
  const previousUnitRef = useRef(unit);
  const previousClimateRef = useRef(showClimateContext);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousUnit = previousUnitRef.current;
    const previousClimate = previousClimateRef.current;
    const unitChanged = previousUnit !== unit;
    const climateChanged = previousClimate !== showClimateContext;
    previousUnitRef.current = unit;
    previousClimateRef.current = showClimateContext;

    let nextAnnouncement = "";
    if (climateChanged) {
      nextAnnouncement = showClimateContext
        ? "Climate context shown."
        : "Climate context hidden.";
    } else if (unitChanged) {
      nextAnnouncement =
        unit === "C"
          ? "Now showing temperatures in Celsius."
          : unit === "F"
            ? "Now showing temperatures in Fahrenheit."
            : "";
    }

    if (!nextAnnouncement || (!unitChanged && !climateChanged)) {
      return;
    }

    setAnnouncement(nextAnnouncement);
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = setTimeout(() => {
      setAnnouncement("");
      clearTimerRef.current = null;
    }, ANNOUNCEMENT_CLEAR_MS);
  }, [unit, showClimateContext]);

  return (
    <div
      id={id}
      className={`app-header-secondary ${isMobileOpen ? "is-mobile-open" : ""}`.trim()}
      role="region"
      aria-label="Display settings"
    >
      <div className="header-control-stack">
        <p id={CLIMATE_CONTEXT_LABEL_ID} className="header-control-label">
          Climate Context
        </p>
        <div
          className="toggle-pill glass"
          role="group"
          aria-labelledby={CLIMATE_CONTEXT_LABEL_ID}
        >
          <button
            type="button"
            className={`toggle-pill-btn ${showClimateContext ? "is-active" : ""}`}
            onClick={onEnableClimateContext}
            aria-pressed={showClimateContext}
            aria-label="Show historical climate comparison"
          >
            On
          </button>
          <button
            type="button"
            className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
            onClick={onDisableClimateContext}
            aria-pressed={!showClimateContext}
            aria-label="Hide historical climate comparison"
          >
            Off
          </button>
        </div>
      </div>

      <div className="unit-toggle glass" role="group" aria-label="Temperature unit">
        <button
          type="button"
          onClick={onSetUnitF}
          className={`unit-btn ${unit === "F" ? "is-active" : ""}`}
          aria-pressed={unit === "F"}
          aria-label="Show temperatures in Fahrenheit"
        >
          {"\u00B0F"}
        </button>
        <button
          type="button"
          onClick={onSetUnitC}
          className={`unit-btn ${unit === "C" ? "is-active" : ""}`}
          aria-pressed={unit === "C"}
          aria-label="Show temperatures in Celsius"
        >
          {"\u00B0C"}
        </button>
      </div>

      {hasPersistedLocation ? (
        <button
          type="button"
          className="header-secondary-action header-secondary-action--danger"
          onClick={onClearSavedLocation}
          aria-label="Clear saved location preference"
        >
          Clear startup city
        </button>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}

export default memo(DisplaySettingsControls);
