import { lazy, memo, Suspense, useCallback, useId, useState } from "react";
import { Settings2 } from "lucide-react";
import CitySearch from "./CitySearch";
import DisplaySettingsControls from "./header/DisplaySettingsControls";
import SavedCitiesStrip from "./header/SavedCitiesStrip";
import { toFiniteNumber } from "../utils/numbers";

const SyncAccountPanel = lazy(() => import("./header/SyncAccountPanel"));

function HeaderControls({
  citySearchRef,
  loadWeather,
  loadCurrentLocation,
  clearSavedLocation,
  savedCities,
  recentCities,
  location,
  loadSavedCity,
  setStartupCity,
  restoreSavedCity,
  forgetSavedCity,
  moveSavedCity,
  syncConnected,
  syncAccount,
  syncState,
  createSyncAccount,
  connectSyncAccount,
  disconnectSyncAccount,
  syncSavedCitiesNow,
  isLocatingCurrent,
  isGeolocationSupported,
  showClimateContext,
  setShowClimateContext,
  unit,
  setUnit,
  hasPersistedLocation,
  startupLocation,
}) {
  const safeSavedCities = Array.isArray(savedCities) ? savedCities : [];
  const syncNeedsAttention =
    syncState?.status === "syncing" ||
    (typeof syncState?.error === "string" && Boolean(syncState.error.trim()));
  const shouldShowSyncPanel =
    safeSavedCities.length > 0 || syncConnected || syncNeedsAttention;

  const handleCitySelect = useCallback(
    (city) => {
      // Strict coercion so a city with null lat/lon does not silently
      // route to (0, 0) Null Island — Number(null) is 0 and would pass
      // the legacy Number.isFinite check.
      const lat = toFiniteNumber(city?.lat);
      const lon = toFiniteNumber(city?.lon);
      if (lat === null || lon === null) {
        return;
      }
      loadWeather(lat, lon, city.name, city.country);
    },
    [loadWeather]
  );

  const handleLoadCurrentLocation = useCallback(() => {
    loadCurrentLocation();
  }, [loadCurrentLocation]);

  // The "My location" button is context-aware: when the user is
  // currently viewing a different city (saved or searched), it reads
  // as a "back home" affordance. When they are already at their GPS
  // location, it reads as a refresh action. The audit flagged the
  // single "My location" label as ambiguous — feels like setup, not
  // return.
  const isViewingCurrentLocation =
    typeof location?.name === "string" && location.name === "Current location";
  const currentLocationButtonLabel = !isGeolocationSupported
    ? "Unavailable"
    : isLocatingCurrent
      ? "Finding..."
      : isViewingCurrentLocation
        ? "Refresh location"
        : "My location";
  const currentLocationAriaLabel = !isGeolocationSupported
    ? "Location access unavailable in this browser"
    : isViewingCurrentLocation
      ? "Refresh device location"
      : "Return to my device location";

  const handleClearSavedLocation = useCallback(() => {
    if (typeof clearSavedLocation === "function") {
      clearSavedLocation();
    }
  }, [clearSavedLocation]);

  const handleSetStartupCity = useCallback(
    (city) => {
      if (typeof setStartupCity === "function") {
        setStartupCity(city);
      }
    },
    [setStartupCity]
  );

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

  const handleCreateSyncAccount = useCallback(() => {
    if (typeof createSyncAccount === "function") {
      void createSyncAccount();
    }
  }, [createSyncAccount]);

  const handleConnectSyncAccount = useCallback((nextSyncKey) => {
    if (typeof connectSyncAccount === "function") {
      void connectSyncAccount(nextSyncKey);
    }
  }, [connectSyncAccount]);

  const handleDisconnectSyncAccount = useCallback(() => {
    if (typeof disconnectSyncAccount === "function") {
      disconnectSyncAccount();
    }
  }, [disconnectSyncAccount]);

  const handleSyncNow = useCallback(() => {
    if (typeof syncSavedCitiesNow === "function") {
      void syncSavedCitiesNow();
    }
  }, [syncSavedCitiesNow]);

  // The mobile settings sheet collapses the secondary controls (climate
  // context toggle, unit toggle, clear-startup-city) so they do not push
  // the hero card three rows down on phones. The button is hidden on
  // desktop via CSS, where the controls stay inline.
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const mobileSettingsId = useId();
  const handleToggleMobileSettings = useCallback(() => {
    setIsMobileSettingsOpen((current) => !current);
  }, []);

  return (
    <div className="app-header-actions">
      <div className="app-header-primary">
        <div className="app-header-primary-row">
          <CitySearch
            ref={citySearchRef}
            onSelect={handleCitySelect}
            savedCities={safeSavedCities}
            recentCities={recentCities}
          />
          <button
            type="button"
            className="current-location-btn glass"
            onClick={handleLoadCurrentLocation}
            disabled={isLocatingCurrent || !isGeolocationSupported}
            aria-busy={isLocatingCurrent || undefined}
            aria-label={currentLocationAriaLabel}
            title={
              isGeolocationSupported
                ? undefined
                : "Location access is unavailable in this browser. Search for a city instead."
            }
          >
            {currentLocationButtonLabel}
          </button>
          <button
            type="button"
            className={`mobile-settings-toggle glass ${isMobileSettingsOpen ? "is-open" : ""}`.trim()}
            aria-expanded={isMobileSettingsOpen}
            aria-controls={mobileSettingsId}
            aria-label={
              isMobileSettingsOpen
                ? "Hide display settings"
                : "Show display settings"
            }
            onClick={handleToggleMobileSettings}
          >
            <Settings2 size={16} aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>
        <SavedCitiesStrip
          savedCities={safeSavedCities}
          location={location}
          startupLocation={startupLocation}
          loadSavedCity={loadSavedCity}
          setStartupCity={handleSetStartupCity}
          restoreSavedCity={restoreSavedCity}
          forgetSavedCity={forgetSavedCity}
          moveSavedCity={moveSavedCity}
        />
        {shouldShowSyncPanel ? (
          <Suspense fallback={null}>
            <SyncAccountPanel
              syncConnected={syncConnected}
              syncAccount={syncAccount}
              syncState={syncState}
              onCreateSyncAccount={handleCreateSyncAccount}
              onConnectSyncAccount={handleConnectSyncAccount}
              onDisconnectSyncAccount={handleDisconnectSyncAccount}
              onSyncNow={handleSyncNow}
            />
          </Suspense>
        ) : null}
      </div>

      <DisplaySettingsControls
        id={mobileSettingsId}
        isMobileOpen={isMobileSettingsOpen}
        showClimateContext={showClimateContext}
        onEnableClimateContext={handleEnableClimateContext}
        onDisableClimateContext={handleDisableClimateContext}
        unit={unit}
        onSetUnitF={handleSetUnitF}
        onSetUnitC={handleSetUnitC}
        onClearSavedLocation={handleClearSavedLocation}
        hasPersistedLocation={hasPersistedLocation}
      />
    </div>
  );
}

export default memo(HeaderControls);
