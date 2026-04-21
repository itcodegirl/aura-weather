import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!showMobileSettings) {
      return undefined;
    }

    const handleDocumentPointerDown = (event) => {
      if (
        controlsRef.current &&
        event.target instanceof Node &&
        !controlsRef.current.contains(event.target)
      ) {
        setShowMobileSettings(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowMobileSettings(false);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMobileSettings]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const desktopQuery = window.matchMedia("(min-width: 701px)");
    const handleDesktopChange = (event) => {
      if (event.matches) {
        setShowMobileSettings(false);
      }
    };

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", handleDesktopChange);
      return () => desktopQuery.removeEventListener("change", handleDesktopChange);
    }

    desktopQuery.addListener(handleDesktopChange);
    return () => desktopQuery.removeListener(handleDesktopChange);
  }, []);

  return (
    <div className="app-header-actions" ref={controlsRef}>
      <div className="app-header-primary">
        <CitySearch
          ref={citySearchRef}
          onSelect={(city) => {
            const lat = Number(city?.lat);
            const lon = Number(city?.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
              return;
            }
            loadWeather(lat, lon, city.name, city.country);
            setShowMobileSettings(false);
          }}
        />
        <button
          type="button"
          className="current-location-btn glass"
          onClick={() => {
            loadCurrentLocation();
            setShowMobileSettings(false);
          }}
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
          onClick={() => setShowMobileSettings((current) => !current)}
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
            onClick={() => setShowClimateContext(true)}
            aria-pressed={showClimateContext}
            aria-label="Enable climate context"
          >
            On
          </button>
          <button
            type="button"
            className={`toggle-pill-btn ${!showClimateContext ? "is-active" : ""}`}
            onClick={() => setShowClimateContext(false)}
            aria-pressed={!showClimateContext}
            aria-label="Disable climate context"
          >
            Off
          </button>
        </div>

        <div className="unit-toggle glass" role="group" aria-label="Temperature unit">
          <button
            onClick={() => setUnit("F")}
            className={`unit-btn ${unit === "F" ? "is-active" : ""}`}
            aria-pressed={unit === "F"}
          >
            {"\u00B0F"}
          </button>
          <button
            onClick={() => setUnit("C")}
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
