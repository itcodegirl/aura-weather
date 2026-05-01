import { memo } from "react";

const CLIMATE_CONTEXT_LABEL_ID = "climate-context-label";

function DisplaySettingsControls({
  showClimateContext,
  onEnableClimateContext,
  onDisableClimateContext,
  unit,
  onSetUnitF,
  onSetUnitC,
  onClearSavedLocation,
}) {
  return (
    <div
      id="display-settings-panel"
      className="app-header-secondary"
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
            aria-label="Enable climate context"
          >
            On
          </button>
          <button
            type="button"
            className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
            onClick={onDisableClimateContext}
            aria-pressed={!showClimateContext}
            aria-label="Disable climate context"
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

      <button
        type="button"
        className="header-secondary-action header-secondary-action--danger"
        onClick={onClearSavedLocation}
        aria-label="Clear saved location preference"
      >
        Clear saved location
      </button>
    </div>
  );
}

export default memo(DisplaySettingsControls);
