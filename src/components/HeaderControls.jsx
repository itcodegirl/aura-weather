import { memo, useCallback } from "react";
import CitySearch from "./CitySearch";

const CLIMATE_CONTEXT_LABEL_ID = "climate-context-label";

function HeaderControls({
  citySearchRef,
  loadWeather,
  loadCurrentLocation,
  clearSavedLocation,
  isLocatingCurrent,
  showClimateContext,
  setShowClimateContext,
  unit,
  setUnit,
}) {
  const handleCitySelect = useCallback(
    (city) => {
      const lat = Number(city?.lat);
      const lon = Number(city?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }
      loadWeather(lat, lon, city.name, city.country);
    },
    [loadWeather]
  );

  const handleLoadCurrentLocation = useCallback(() => {
    loadCurrentLocation();
  }, [loadCurrentLocation]);

  const handleClearSavedLocation = useCallback(() => {
    if (typeof clearSavedLocation === "function") {
      clearSavedLocation();
    }
  }, [clearSavedLocation]);

  const handleSetClimateContext = useCallback(
    (nextValue) => {
      setShowClimateContext(nextValue);
    },
    [setShowClimateContext]
  );

  const handleEnableClimateContext = useCallback(() => {
    handleSetClimateContext(true);
  }, [handleSetClimateContext]);

  const handleDisableClimateContext = useCallback(() => {
    handleSetClimateContext(false);
  }, [handleSetClimateContext]);

  const handleSetUnit = useCallback(
    (nextUnit) => {
      setUnit(nextUnit);
    },
    [setUnit]
  );

  const handleSetUnitF = useCallback(() => {
    handleSetUnit("F");
  }, [handleSetUnit]);

  const handleSetUnitC = useCallback(() => {
    handleSetUnit("C");
  }, [handleSetUnit]);

  return (
    <div className="app-header-actions">
      <div className="app-header-primary">
        <CitySearch ref={citySearchRef} onSelect={handleCitySelect} />
        <button
          type="button"
          className="current-location-btn glass"
          onClick={handleLoadCurrentLocation}
          disabled={isLocatingCurrent}
          aria-label="Use my location"
        >
          {isLocatingCurrent ? "Finding..." : "My location"}
        </button>
      </div>

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
              onClick={handleEnableClimateContext}
              aria-pressed={showClimateContext}
              aria-label="Enable climate context"
            >
              On
            </button>
            <button
              type="button"
              className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
              onClick={handleDisableClimateContext}
              aria-pressed={!showClimateContext}
              aria-label="Disable climate context"
            >
              Off
            </button>
          </div>
        </div>

        <div className="unit-toggle glass" role="group" aria-label="Temperature unit">
          <button
            onClick={handleSetUnitF}
            className={`unit-btn ${unit === "F" ? "is-active" : ""}`}
            aria-pressed={unit === "F"}
            aria-label="Show temperatures in Fahrenheit"
          >
            {"\u00B0F"}
          </button>
          <button
            onClick={handleSetUnitC}
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
          onClick={handleClearSavedLocation}
          aria-label="Clear saved location preference"
        >
          Clear saved location
        </button>
      </div>
    </div>
  );
}

export default memo(HeaderControls);
