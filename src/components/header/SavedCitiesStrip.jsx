import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toFiniteNumber } from "../../utils/numbers";

const UNDO_TIMEOUT_MS = 6000;

function SavedCitiesStrip({
  savedCities,
  location,
  startupLocation,
  loadSavedCity,
  setStartupCity,
  forgetSavedCity,
  restoreSavedCity,
  moveSavedCity,
}) {
  const safeSavedCities = Array.isArray(savedCities) ? savedCities : [];
  const [pendingUndo, setPendingUndo] = useState(null);
  // Screen-reader feedback for reorder actions. Visually the chip just
  // changes place; assistive tech needs the new position spoken.
  const [orderNotice, setOrderNotice] = useState("");
  const undoTimeoutRef = useRef(null);
  // Focus-management: after a chip is removed, the focused remove button
  // unmounts and the browser drops focus to document.body. Move focus to
  // the Undo button instead so keyboard / SR users can act on the
  // recovery affordance without re-tabbing through the header.
  const undoButtonRef = useRef(null);
  const shouldFocusUndoRef = useRef(false);
  useEffect(() => {
    if (shouldFocusUndoRef.current && pendingUndo && undoButtonRef.current) {
      undoButtonRef.current.focus();
      shouldFocusUndoRef.current = false;
    }
  }, [pendingUndo]);

  const clearUndoTimer = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  const handleLoadSavedCity = useCallback(
    (city) => {
      if (typeof loadSavedCity === "function") {
        loadSavedCity(city);
      }
    },
    [loadSavedCity]
  );

  const handleForgetSavedCity = useCallback(
    (event, city, wasStartup = false) => {
      event.stopPropagation();
      if (typeof forgetSavedCity === "function") {
        forgetSavedCity(city);
      }

      // Optimistically remove the chip and surface a 6-second undo
      // window. If the user does not act, the deletion is final; if
      // they tap Undo, restoreSavedCity puts the chip back without
      // switching the active forecast.
      clearUndoTimer();
      // Mark that the upcoming render should hand focus to the Undo
      // button. We flip this BEFORE setPendingUndo so the effect that
      // reads it on the next render finds it set.
      shouldFocusUndoRef.current = true;
      setPendingUndo({ city, wasStartup });
      undoTimeoutRef.current = setTimeout(() => {
        setPendingUndo(null);
        undoTimeoutRef.current = null;
      }, UNDO_TIMEOUT_MS);
    },
    [forgetSavedCity, clearUndoTimer]
  );

  const handleSetStartupCity = useCallback(
    (event, city) => {
      event.stopPropagation();
      if (typeof setStartupCity === "function") {
        setStartupCity(city);
      }
    },
    [setStartupCity]
  );

  // Bound moves are guarded here (not via the disabled attribute) so
  // the arrow buttons keep a stable tab order and never drop focus to
  // <body> when a chip reaches the first or last slot mid-interaction.
  const handleMoveSavedCity = useCallback(
    (event, city, offset, index, total) => {
      event.stopPropagation();
      const targetIndex = index + offset;
      if (
        typeof moveSavedCity !== "function" ||
        targetIndex < 0 ||
        targetIndex >= total
      ) {
        return;
      }

      moveSavedCity(city, offset);
      setOrderNotice(
        `${city.name} moved to position ${targetIndex + 1} of ${total}.`
      );
    },
    [moveSavedCity]
  );

  const handleUndo = useCallback(() => {
    if (!pendingUndo || typeof restoreSavedCity !== "function") {
      setPendingUndo(null);
      clearUndoTimer();
      return;
    }
    restoreSavedCity(pendingUndo.city, {
      makeStartup: pendingUndo.wasStartup,
    });
    setPendingUndo(null);
    clearUndoTimer();
  }, [pendingUndo, restoreSavedCity, clearUndoTimer]);

  const handleDismissUndo = useCallback(() => {
    setPendingUndo(null);
    clearUndoTimer();
  }, [clearUndoTimer]);

  if (safeSavedCities.length === 0 && !pendingUndo) {
    return null;
  }

  return (
    <>
      {safeSavedCities.length > 0 && (
        <div
          className="saved-cities-strip"
          role="list"
          aria-label="Saved cities"
        >
          {safeSavedCities.map((city, index) => {
            const key = `${city.lat}:${city.lon}:${city.name}`;
            const total = safeSavedCities.length;
            const isFirst = index === 0;
            const isLast = index === total - 1;
            // Strict equality through toFiniteNumber so a null/undefined
            // active location does not coerce to 0 and falsely match a
            // saved city with null lat/lon.
            const activeLat = toFiniteNumber(location?.lat);
            const activeLon = toFiniteNumber(location?.lon);
            const startupLat = toFiniteNumber(startupLocation?.lat);
            const startupLon = toFiniteNumber(startupLocation?.lon);
            const cityLat = toFiniteNumber(city.lat);
            const cityLon = toFiniteNumber(city.lon);
            const isActive =
              activeLat !== null &&
              activeLon !== null &&
              activeLat === cityLat &&
              activeLon === cityLon;
            const isStartup =
              startupLat !== null &&
              startupLon !== null &&
              startupLat === cityLat &&
              startupLon === cityLon;

            return (
              <div
                key={key}
                className={`saved-city-chip-wrap ${isActive ? "is-active" : ""} ${isStartup ? "is-startup" : ""}`.trim()}
                role="listitem"
              >
                <button
                  type="button"
                  className={`saved-city-chip ${isActive ? "is-active" : ""} ${isStartup ? "is-startup" : ""}`.trim()}
                  onClick={() => handleLoadSavedCity(city)}
                  /*
                   * aria-current rather than aria-pressed: the active
                   * chip indicates "this is the currently-displayed
                   * location", not "the user has toggled this on".
                   * Same rationale as the HourlyCard touch-sample fix.
                   */
                  aria-current={isActive ? "true" : undefined}
                >
                  {city.name}
                </button>
                {total > 1 && (
                  <>
                    {/*
                     * aria-disabled (not disabled) at the ends: the
                     * buttons stay in the tab order and keep focus
                     * after a chip lands in the first or last slot;
                     * the click handler no-ops out-of-range moves.
                     */}
                    <button
                      type="button"
                      className="saved-city-move"
                      onClick={(event) =>
                        handleMoveSavedCity(event, city, -1, index, total)
                      }
                      aria-label={`Move ${city.name} earlier in your saved cities`}
                      aria-disabled={isFirst || undefined}
                    >
                      {"‹"}
                    </button>
                    <button
                      type="button"
                      className="saved-city-move"
                      onClick={(event) =>
                        handleMoveSavedCity(event, city, 1, index, total)
                      }
                      aria-label={`Move ${city.name} later in your saved cities`}
                      aria-disabled={isLast || undefined}
                    >
                      {"›"}
                    </button>
                  </>
                )}
                {isStartup ? (
                  <span
                    className="saved-city-startup-badge"
                    title="Opens when Aura starts"
                  >
                    Startup
                  </span>
                ) : (
                  <button
                    type="button"
                    className="saved-city-startup"
                    onClick={(event) => handleSetStartupCity(event, city)}
                    aria-label={`Make ${city.name} your startup city`}
                    title={`Make ${city.name} your startup city`}
                  >
                    Set startup
                  </button>
                )}
                <button
                  type="button"
                  className="saved-city-remove"
                  onClick={(event) =>
                    handleForgetSavedCity(event, city, isStartup)
                  }
                  aria-label={`Remove ${city.name} from saved cities`}
                >
                  {"\u00D7"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* Persistent live region so reorder announcements are reliable;
          it sits outside the role=list container, which may only have
          listitem children. */}
      <span className="sr-only" role="status" aria-live="polite">
        {orderNotice}
      </span>
      {pendingUndo && (
        <div
          className="saved-city-undo"
          role="status"
          aria-live="polite"
        >
          <span className="saved-city-undo-text">
            Removed <strong>{pendingUndo.city.name}</strong>
          </span>
          <button
            type="button"
            className="saved-city-undo-action"
            onClick={handleUndo}
            ref={undoButtonRef}
          >
            Undo
          </button>
          <button
            type="button"
            className="saved-city-undo-dismiss"
            onClick={handleDismissUndo}
            aria-label="Dismiss undo notice"
          >
            {"\u00D7"}
          </button>
        </div>
      )}
    </>
  );
}

export default memo(SavedCitiesStrip);
