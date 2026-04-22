import { memo, useCallback, useState } from "react";
import CitySearch from "./CitySearch";

const CLIMATE_CONTEXT_LABEL_ID = "climate-context-label";

function HeaderControls({
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
  showClimateContext,
  setShowClimateContext,
  unit,
  setUnit,
}) {
  const [syncKeyInput, setSyncKeyInput] = useState("");

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

  const handleLoadSavedCity = useCallback(
    (city) => {
      if (typeof loadSavedCity === "function") {
        loadSavedCity(city);
      }
    },
    [loadSavedCity]
  );

  const handleForgetSavedCity = useCallback(
    (event, city) => {
      event.stopPropagation();
      if (typeof forgetSavedCity === "function") {
        forgetSavedCity(city);
      }
    },
    [forgetSavedCity]
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

  const safeSavedCities = Array.isArray(savedCities) ? savedCities : [];
  const syncStatusText =
    typeof syncState?.message === "string" && syncState.message.trim()
      ? syncState.message.trim()
      : syncConnected
        ? "Sync connected"
        : "Sync not connected";

  const syncErrorText =
    typeof syncState?.error === "string" && syncState.error.trim()
      ? syncState.error.trim()
      : "";
  const isSyncing = syncState?.status === "syncing";

  const handleCreateSyncAccount = useCallback(() => {
    if (typeof createSyncAccount === "function") {
      void createSyncAccount();
    }
  }, [createSyncAccount]);

  const handleConnectSyncAccount = useCallback(() => {
    if (typeof connectSyncAccount === "function") {
      void connectSyncAccount(syncKeyInput);
    }
  }, [connectSyncAccount, syncKeyInput]);

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

  return (
    <div className="app-header-actions">
      <div className="app-header-primary">
        <div className="app-header-primary-row">
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
        {safeSavedCities.length > 0 && (
          <div className="saved-cities-strip" role="list" aria-label="Saved cities">
            {safeSavedCities.map((city) => {
              const key = `${city.lat}:${city.lon}:${city.name}`;
              const isActive =
                Number(location?.lat) === Number(city.lat) &&
                Number(location?.lon) === Number(city.lon);

              return (
                <div
                  key={key}
                  className={`saved-city-chip-wrap ${isActive ? "is-active" : ""}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className={`saved-city-chip ${isActive ? "is-active" : ""}`}
                    onClick={() => handleLoadSavedCity(city)}
                    aria-pressed={isActive}
                  >
                    {city.name}
                  </button>
                  <button
                    type="button"
                    className="saved-city-remove"
                    onClick={(event) => handleForgetSavedCity(event, city)}
                    aria-label={`Remove ${city.name} from saved cities`}
                  >
                    \u00D7
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="sync-account-panel" aria-live="polite">
          <p className="sync-account-title">Account Sync</p>
          <p className="sync-account-status">{syncStatusText}</p>
          {syncConnected ? (
            <div className="sync-account-actions">
              <button
                type="button"
                className="sync-account-btn"
                onClick={handleSyncNow}
                disabled={isSyncing}
              >
                Sync now
              </button>
              <button
                type="button"
                className="sync-account-btn sync-account-btn--subtle"
                onClick={handleDisconnectSyncAccount}
                disabled={isSyncing}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="sync-account-connect">
              <button
                type="button"
                className="sync-account-btn"
                onClick={handleCreateSyncAccount}
                disabled={isSyncing}
              >
                Create cloud account
              </button>
              <div className="sync-account-manual">
                <input
                  type="text"
                  className="sync-account-input"
                  value={syncKeyInput}
                  onChange={(event) => setSyncKeyInput(event.target.value)}
                  placeholder="Paste sync key or URL"
                  aria-label="Sync key"
                  disabled={isSyncing}
                />
                <button
                  type="button"
                  className="sync-account-btn sync-account-btn--subtle"
                  onClick={handleConnectSyncAccount}
                  disabled={isSyncing}
                >
                  Connect
                </button>
              </div>
            </div>
          )}
          {syncConnected && (
            <p className="sync-account-key" title={syncAccount?.syncKey || undefined}>
              Key: {typeof syncAccount?.syncKey === "string"
                ? syncAccount.syncKey.slice(0, 32)
                : ""}
            </p>
          )}
          {syncErrorText && <p className="sync-account-error">{syncErrorText}</p>}
        </div>
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
