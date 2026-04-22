import { memo, useCallback, useEffect, useRef, useState } from "react";

function StatusStack({
  locationNotice,
  showLocationSetupPrompt,
  onUseCurrentLocation,
  onFocusCitySearch,
  isLocatingCurrent,
  isBackgroundLoading,
  showRefreshError,
  onRetry,
}) {
  const [isRetryCoolingDown, setIsRetryCoolingDown] = useState(false);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const handleRetry = useCallback(() => {
    if (isRetryCoolingDown || typeof onRetry !== "function") {
      return;
    }

    setIsRetryCoolingDown(true);
    onRetry();

    retryTimerRef.current = setTimeout(() => {
      setIsRetryCoolingDown(false);
      retryTimerRef.current = null;
    }, 1400);
  }, [isRetryCoolingDown, onRetry]);

  const hasStatusStack = Boolean(
    locationNotice || isBackgroundLoading || showRefreshError || showLocationSetupPrompt
  );

  if (!hasStatusStack) {
    return null;
  }

  return (
    <div className="status-stack">
      {locationNotice && (
        <p className="location-notice">
          <span className="location-notice-label">Location</span>
          <span className="location-notice-text">{locationNotice}</span>
        </p>
      )}
      {showLocationSetupPrompt && (
        <section className="location-setup-prompt" aria-label="Location setup">
          <p className="location-setup-title">
            Personalize your forecast by using your location or searching for your city.
          </p>
          <div className="location-setup-actions">
            <button
              type="button"
              className="location-setup-btn location-setup-btn--primary"
              onClick={onUseCurrentLocation}
              disabled={isLocatingCurrent}
            >
              {isLocatingCurrent ? "Finding your location..." : "Use my location"}
            </button>
            <button
              type="button"
              className="location-setup-btn"
              onClick={onFocusCitySearch}
            >
              Search a city
            </button>
          </div>
        </section>
      )}
      {isBackgroundLoading && (
        <p className="app-status app-status--loading">
          Updating weather for your current settings...
        </p>
      )}
      {showRefreshError && (
        <div className="app-status app-status--error" role="alert">
          <span className="app-status-message">
            Could not refresh weather right now. Showing last known data.
          </span>
          <button
            type="button"
            className="app-status-retry"
            onClick={handleRetry}
            disabled={isRetryCoolingDown}
          >
            {isRetryCoolingDown ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(StatusStack);
