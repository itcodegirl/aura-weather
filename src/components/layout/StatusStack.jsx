import { memo } from "react";

function StatusStack({
  locationNotice,
  isBackgroundLoading,
  showRefreshError,
  onRetry,
}) {
  const hasStatusStack = Boolean(
    locationNotice || isBackgroundLoading || showRefreshError
  );

  if (!hasStatusStack) {
    return null;
  }

  return (
    <div className="status-stack">
      {locationNotice && (
        <p className="location-notice" role="status" aria-live="polite">
          {locationNotice}
        </p>
      )}
      {isBackgroundLoading && (
        <p className="app-status app-status--loading" role="status" aria-live="polite">
          Updating weather for your current settings...
        </p>
      )}
      {showRefreshError && (
        <p className="app-status app-status--error" role="alert">
          Could not refresh weather right now. Showing last known data.
          <button
            type="button"
            className="app-status-retry"
            onClick={onRetry}
          >
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

export default memo(StatusStack);
