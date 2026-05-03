import { memo } from "react";
import HeaderControls from "../HeaderControls";
import "./AppHeader.css";

function AppHeader({
  citySearchRef,
  loadWeather,
  loadCurrentLocation,
  clearSavedLocation,
  savedCities,
  location,
  loadSavedCity,
  forgetSavedCity,
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
}) {
  return (
    <header className="app-header glass">
      <div className="brand-wrap">
        <img
          src="/atmosphere-ring.svg"
          alt=""
          aria-hidden="true"
          className="brand-mark"
          width="28"
          height="28"
        />
        <h1 className="brand">Aura</h1>
        <p className="tagline">Atmospheric Intelligence</p>
      </div>
      <HeaderControls
        citySearchRef={citySearchRef}
        loadWeather={loadWeather}
        loadCurrentLocation={loadCurrentLocation}
        clearSavedLocation={clearSavedLocation}
        savedCities={savedCities}
        location={location}
        loadSavedCity={loadSavedCity}
        forgetSavedCity={forgetSavedCity}
        syncConnected={syncConnected}
        syncAccount={syncAccount}
        syncState={syncState}
        createSyncAccount={createSyncAccount}
        connectSyncAccount={connectSyncAccount}
        disconnectSyncAccount={disconnectSyncAccount}
        syncSavedCitiesNow={syncSavedCitiesNow}
        isLocatingCurrent={isLocatingCurrent}
        isGeolocationSupported={isGeolocationSupported}
        showClimateContext={showClimateContext}
        setShowClimateContext={setShowClimateContext}
        unit={unit}
        setUnit={setUnit}
        hasPersistedLocation={hasPersistedLocation}
      />
    </header>
  );
}

export default memo(AppHeader);
