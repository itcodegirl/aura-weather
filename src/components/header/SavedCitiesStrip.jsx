import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toFiniteNumber } from "../../utils/numbers";

const UNDO_TIMEOUT_MS = 6000;
// A live region only announces on text change, so an identical repeat
// message is a no-op. Clearing shortly after the announce keeps the
// next identical reorder audible.
const ORDER_NOTICE_CLEAR_MS = 1500;

// Chip identity, shared by the render key and by focus targeting so the
// two cannot drift apart.
function savedCityKey(city) {
  return `${city.lat}:${city.lon}:${city.name}`;
}

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
  const orderNoticeTimeoutRef = useRef(null);
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

  // The same hand-off in the other direction. The undo region unmounts
  // on activation, on timeout expiry, and on dismissal; without this,
  // focus lands back on document.body — the exact drop the hand-off
  // above exists to prevent. The request is { key } to aim at a chip,
  // { key: null } for the nearest stable control, and stays null when
  // focus was not inside the region, so focus the user has since moved
  // is never stolen back.
  const stripRef = useRef(null);
  const undoRegionRef = useRef(null);
  const refocusRequestRef = useRef(null);

  const undoHoldsFocus = useCallback(() => {
    const region = undoRegionRef.current;
    if (!region) {
      return false;
    }
    return region.contains(region.ownerDocument?.activeElement ?? null);
  }, []);

  useEffect(() => {
    const request = refocusRequestRef.current;
    if (pendingUndo || !request) {
      return;
    }
    refocusRequestRef.current = null;
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const chips = Array.from(strip.querySelectorAll(".saved-city-chip"));
    const restored = request.key
      ? chips.find((chip) => chip.dataset.cityKey === request.key)
      : null;
    // The restored chip when it can be targeted; otherwise the strip's
    // nearest stable control, which is its first chip.
    const next = restored ?? chips[0] ?? null;
    if (next) {
      next.focus();
    }
  }, [pendingUndo, savedCities]);

  const clearUndoTimer = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, []);

  const clearOrderNoticeTimer = useCallback(() => {
    if (orderNoticeTimeoutRef.current) {
      clearTimeout(orderNoticeTimeoutRef.current);
      orderNoticeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);
  useEffect(() => clearOrderNoticeTimer, [clearOrderNoticeTimer]);

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
        // Expiry unmounts the region as surely as a click does, so the
        // same guarded hand-off applies: reclaim focus only when it is
        // still standing inside what is about to disappear.
        refocusRequestRef.current = undoHoldsFocus() ? { key: null } : null;
        setPendingUndo(null);
        undoTimeoutRef.current = null;
      }, UNDO_TIMEOUT_MS);
    },
    [forgetSavedCity, clearUndoTimer, undoHoldsFocus]
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
      clearOrderNoticeTimer();
      setOrderNotice(
        `${city.name} moved to position ${targetIndex + 1} of ${total}.`
      );
      orderNoticeTimeoutRef.current = setTimeout(() => {
        setOrderNotice("");
        orderNoticeTimeoutRef.current = null;
      }, ORDER_NOTICE_CLEAR_MS);
    },
    [moveSavedCity, clearOrderNoticeTimer]
  );

  const handleUndo = useCallback(() => {
    // Read the focus position before the region unmounts; afterwards
    // activeElement is already document.body and the question "did the
    // user still have focus in here?" can no longer be answered.
    const heldFocus = undoHoldsFocus();
    if (!pendingUndo || typeof restoreSavedCity !== "function") {
      refocusRequestRef.current = heldFocus ? { key: null } : null;
      setPendingUndo(null);
      clearUndoTimer();
      return;
    }
    refocusRequestRef.current = heldFocus
      ? { key: savedCityKey(pendingUndo.city) }
      : null;
    restoreSavedCity(pendingUndo.city, {
      makeStartup: pendingUndo.wasStartup,
    });
    setPendingUndo(null);
    clearUndoTimer();
  }, [pendingUndo, restoreSavedCity, clearUndoTimer, undoHoldsFocus]);

  const handleDismissUndo = useCallback(() => {
    refocusRequestRef.current = undoHoldsFocus() ? { key: null } : null;
    setPendingUndo(null);
    clearUndoTimer();
  }, [clearUndoTimer, undoHoldsFocus]);

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
          ref={stripRef}
        >
          {safeSavedCities.map((city, index) => {
            const key = savedCityKey(city);
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
                  /* Focus-restoration target after an undo puts this
                     chip back; escaping-free lookup via dataset. */
                  data-city-key={key}
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
          ref={undoRegionRef}
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
