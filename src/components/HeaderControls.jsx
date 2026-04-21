import { useCallback, useEffect, useRef, useState } from "react";
import CitySearch from "./CitySearch";

export default function HeaderControls({
  citySearchRef,
  loadWeather,
  loadCurrentLocation,
  isLocatingCurrent,
  showClimateContext,
  setShowClimateContext,
  unit,
  setUnit,
}) {
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const controlsRef = useRef(null);

  const closeMobileSettings = useCallback(() => {
    setShowMobileSettings(false);
  }, []);

  const handleCitySelect = useCallback(
    (city) => {
      const lat = Number(city?.lat);
      const lon = Number(city?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }
      loadWeather(lat, lon, city.name, city.country);
      closeMobileSettings();
    },
    [closeMobileSettings, loadWeather]
  );

  const handleLoadCurrentLocation = useCallback(() => {
    loadCurrentLocation();
    closeMobileSettings();
  }, [closeMobileSettings, loadCurrentLocation]);

  const handleToggleSettings = useCallback(() => {
    setShowMobileSettings((current) => !current);
  }, []);

  const handleSetClimateContext = useCallback(
    (nextValue) => {
      setShowClimateContext(nextValue);
    },
    [setShowClimateContext]
  );

  const handleSetUnit = useCallback(
    (nextUnit) => {
      setUnit(nextUnit);
    },
    [setUnit]
  );

  const handleDesktopChange = useCallback((event) => {
    if (event.matches) {
      closeMobileSettings();
    }
  }, [closeMobileSettings]);

  const handleDocumentPointerDown = useCallback(
    (event) => {
      if (
        controlsRef.current &&
        event.target instanceof Node &&
        !controlsRef.current.contains(event.target)
      ) {
        closeMobileSettings();
      }
    },
    [closeMobileSettings]
  );

  const handleEscape = useCallback(
    (event) => {
      if (event.key === "Escape") {
        closeMobileSettings();
      }
    },
    [closeMobileSettings]
  );

  useEffect(() => {
    if (!showMobileSettings) {
      return undefined;
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMobileSettings, handleDocumentPointerDown, handleEscape]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const desktopBreakpoint = (() => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--bp-tablet-small")
        .trim();
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed + 1 : 761;
    })();

    const desktopQuery = window.matchMedia(`(min-width: ${desktopBreakpoint}px)`);

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", handleDesktopChange);
      return () => desktopQuery.removeEventListener("change", handleDesktopChange);
    }

    desktopQuery.addListener(handleDesktopChange);
    return () => desktopQuery.removeListener(handleDesktopChange);
  }, [handleDesktopChange]);

  return (
    <div className="app-header-actions" ref={controlsRef}>
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
        <button
          type="button"
          className="settings-toggle glass"
          aria-label={showMobileSettings ? "Hide display settings" : "Show display settings"}
          aria-expanded={showMobileSettings}
          aria-controls="mobile-settings-panel"
          aria-haspopup="true"
          onClick={handleToggleSettings}
        >
          Display
        </button>
      </div>

      <div
        id="mobile-settings-panel"
        className={`app-header-secondary ${showMobileSettings ? "is-open" : ""}`}
        role="region"
        aria-label="Display settings"
      >
        <div
          className="toggle-pill glass"
          role="group"
          aria-label="Climate context settings"
        >
          <button
            type="button"
            className={`toggle-pill-btn ${showClimateContext ? "is-active" : ""}`}
            onClick={() => handleSetClimateContext(true)}
            aria-pressed={showClimateContext}
            aria-label="Enable climate context"
          >
            On
          </button>
          <button
            type="button"
            className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
            onClick={() => handleSetClimateContext(false)}
            aria-pressed={!showClimateContext}
            aria-label="Disable climate context"
          >
            Off
          </button>
        </div>

        <div className="unit-toggle glass" role="group" aria-label="Temperature unit">
          <button
            onClick={() => handleSetUnit("F")}
            className={`unit-btn ${unit === "F" ? "is-active" : ""}`}
            aria-pressed={unit === "F"}
          >
            {"\u00B0F"}
          </button>
          <button
            onClick={() => handleSetUnit("C")}
            className={`unit-btn ${unit === "C" ? "is-active" : ""}`}
            aria-pressed={unit === "C"}
          >
            {"\u00B0C"}
          </button>
        </div>
      </div>
    </div>
  );
}
