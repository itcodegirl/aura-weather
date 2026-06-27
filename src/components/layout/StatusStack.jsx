import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toFiniteNumber } from "../../utils/numbers";
import "./StatusStack.css";

function normalizeSentence(value, fallback) {
  const message = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return message.replace(/[.!?]+$/, "");
}

function formatCacheCapturedAt(value) {
  const timestamp = toFiniteNumber(value);
  if (timestamp === null) {
    return "";
  }

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusStack({
  locationNotice,
  showLocationSetupPrompt,
  showPermissionOnboarding,
  onUseCurrentLocation,
  onFocusCitySearch,
  onDismissPermissionOnboarding,
  isLocatingCurrent,
  isGeolocationSupported,
  isBackgroundLoading,
  showRefreshError,
  error = "",
  cacheStatus = "idle",
  cacheCapturedAt = null,
  onRetry,
  serviceWorkerUpdateAvailable = false,
  serviceWorkerOfflineReady = false,
  isServiceWorkerRefreshing = false,
  onRefreshServiceWorkerUpdate,
  onDismissServiceWorkerUpdate,
  onDismissServiceWorkerOfflineReady,
  installPromptAvailable = false,
  isInstallPromptOpening = false,
  onInstallApp,
  onDismissInstallPrompt,
  showRuntimeStatus = true,
  showSetupPrompts = true,
  className = "",
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
    // isBackgroundLoading means a forecast request is already in
    // flight; firing another would abort it and restart the clock for
    // no benefit. The cooldown alone could not cover a slow request
    // that outlives the 1400ms timer.
    if (isRetryCoolingDown || isBackgroundLoading || typeof onRetry !== "function") {
      return;
    }

    setIsRetryCoolingDown(true);
    onRetry();

    retryTimerRef.current = setTimeout(() => {
      setIsRetryCoolingDown(false);
      retryTimerRef.current = null;
    }, 1400);
  }, [isRetryCoolingDown, isBackgroundLoading, onRetry]);

  const hasSetupPrompts = showSetupPrompts && Boolean(
    showLocationSetupPrompt || showPermissionOnboarding
  );
  const showLocationNotice = showRuntimeStatus && Boolean(locationNotice) && !hasSetupPrompts;
  const showLoadingStatus = showRuntimeStatus && isBackgroundLoading;
  const showUpdateStatus = showRuntimeStatus && serviceWorkerUpdateAvailable;
  const showOfflineReadyStatus = showRuntimeStatus && serviceWorkerOfflineReady;
  const showInstallStatus = showRuntimeStatus
    && installPromptAvailable
    && !serviceWorkerUpdateAvailable
    && !serviceWorkerOfflineReady;
  const showRefreshErrorStatus = showRuntimeStatus && showRefreshError;
  const hasRuntimeStatus = Boolean(
    showLocationNotice ||
    showLoadingStatus ||
    showRefreshErrorStatus ||
    showUpdateStatus ||
    showOfflineReadyStatus ||
    showInstallStatus
  );
  const hasStatusStack = hasRuntimeStatus || hasSetupPrompts;
  const isShowingCachedForecast = cacheStatus === "restored";
  const refreshErrorBase = normalizeSentence(
    error,
    isShowingCachedForecast
      ? "Live weather is unavailable"
      : "Could not refresh weather right now"
  );
  const cacheCapturedLabel = formatCacheCapturedAt(cacheCapturedAt);
  const refreshErrorMessage = isShowingCachedForecast
    ? `${refreshErrorBase}. Showing your most recent saved forecast${cacheCapturedLabel ? ` from ${cacheCapturedLabel}` : ""}.`
    : `${refreshErrorBase}. Showing last known data.`;

  if (!hasStatusStack) {
    return null;
  }

  return (
    <div className={`status-stack ${className}`.trim()}>
      {showSetupPrompts && showPermissionOnboarding && (
        <section className="permission-onboarding" aria-label="Location onboarding">
          <p className="permission-onboarding-kicker">First-time setup</p>
          <h2 className="permission-onboarding-title">Start with Palos Hills, switch anytime</h2>
          <p className="permission-onboarding-copy">
            {isGeolocationSupported
              ? "Palos Hills is loaded as a useful starting point. Use your location for local conditions or search any city when you're ready."
              : "Palos Hills is loaded as a useful starting point. Browser location is unavailable here, so search any city when you're ready."}
          </p>
          <div className="permission-onboarding-actions">
            {isGeolocationSupported ? (
              <button
                type="button"
                className="location-setup-btn location-setup-btn--primary"
                onClick={onUseCurrentLocation}
                disabled={isLocatingCurrent}
                aria-busy={isLocatingCurrent || undefined}
              >
                {isLocatingCurrent ? "Requesting permission..." : "Allow location access"}
              </button>
            ) : (
              <button
                type="button"
                className="location-setup-btn location-setup-btn--primary"
                onClick={onFocusCitySearch}
              >
                Search a city
              </button>
            )}
            <button
              type="button"
              className="location-setup-btn"
              onClick={onDismissPermissionOnboarding}
            >
              Keep Palos Hills for now
            </button>
          </div>
        </section>
      )}
      {showSetupPrompts && showLocationSetupPrompt && (
        <section className="location-setup-prompt" aria-label="Location setup">
          <p className="location-setup-title">
            {isGeolocationSupported
              ? "Want a closer forecast? Use your location for a local read or search any city."
              : "Want a different forecast? Search any city for local conditions. Browser location is unavailable here."}
          </p>
          <div className="location-setup-actions">
            {isGeolocationSupported ? (
              <button
                type="button"
                className="location-setup-btn location-setup-btn--primary"
                onClick={onUseCurrentLocation}
                disabled={isLocatingCurrent}
                aria-busy={isLocatingCurrent || undefined}
              >
                {isLocatingCurrent ? "Finding your location..." : "Use my location"}
              </button>
            ) : null}
            <button
              type="button"
              className={`location-setup-btn ${isGeolocationSupported ? "" : "location-setup-btn--primary"}`.trim()}
              onClick={onFocusCitySearch}
            >
              Search a city
            </button>
          </div>
        </section>
      )}
      {hasRuntimeStatus && (
        <div className="runtime-status-tray" aria-label="App notices">
          {showLocationNotice && (
            <p className="location-notice" role="status" aria-live="polite">
              <span className="location-notice-label">Location</span>
              <span className="location-notice-text">{locationNotice}</span>
            </p>
          )}
          {showLoadingStatus && (
            <p className="app-status app-status--loading" role="status" aria-live="polite">
              Updating weather...
            </p>
          )}
          {showUpdateStatus && (
            <div className="app-status app-status--update" role="status" aria-live="polite">
              <span className="app-status-message">
                App update ready.
              </span>
              <span className="app-status-actions">
                <button
                  type="button"
                  className="app-status-action app-status-action--primary"
                  onClick={onRefreshServiceWorkerUpdate}
                  disabled={isServiceWorkerRefreshing}
                  aria-busy={isServiceWorkerRefreshing || undefined}
                >
                  {isServiceWorkerRefreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  className="app-status-action"
                  onClick={onDismissServiceWorkerUpdate}
                  disabled={isServiceWorkerRefreshing}
                >
                  Later
                </button>
              </span>
            </div>
          )}
          {showOfflineReadyStatus && (
            <div className="app-status app-status--ready" role="status" aria-live="polite">
              <span className="app-status-message">
                Offline shell ready.
              </span>
              <span className="app-status-actions">
                <button
                  type="button"
                  className="app-status-action"
                  onClick={onDismissServiceWorkerOfflineReady}
                >
                  Got it
                </button>
              </span>
            </div>
          )}
          {showInstallStatus && (
            <div className="app-status app-status--install" role="status" aria-live="polite">
              <span className="app-status-message">
                Install Aura for faster access.
              </span>
              <span className="app-status-actions">
                <button
                  type="button"
                  className="app-status-action app-status-action--primary"
                  onClick={onInstallApp}
                  disabled={isInstallPromptOpening}
                  aria-busy={isInstallPromptOpening || undefined}
                >
                  {isInstallPromptOpening ? "Opening..." : "Install"}
                </button>
                <button
                  type="button"
                  className="app-status-action"
                  onClick={onDismissInstallPrompt}
                  disabled={isInstallPromptOpening}
                >
                  Later
                </button>
              </span>
            </div>
          )}
          {showRefreshErrorStatus && (
            <div className="app-status app-status--error" role="alert">
              <span className="app-status-message">
                {refreshErrorMessage}
              </span>
              <button
                type="button"
                className="app-status-retry"
                onClick={handleRetry}
                disabled={isRetryCoolingDown || isBackgroundLoading}
                aria-busy={isRetryCoolingDown || isBackgroundLoading || undefined}
              >
                {isRetryCoolingDown || isBackgroundLoading ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(StatusStack);
