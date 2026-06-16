import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadRadarState,
  readRadarOverride,
  RADAR_STATUS,
} from "../api/rainviewer.js";

// RainViewer refreshes its catalogue every ~10 minutes; we re-poll every
// 5 to stay close to the newest observed frame without hammering the
// free endpoint.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function loadingState() {
  return { host: "", frames: [], status: RADAR_STATUS.LOADING };
}

function overrideState(override) {
  // Demo / QA overrides force an honest degraded state without a network
  // call. 'nocoverage' still fetches real frames (the map renders; the
  // panel draws a quiet note), so it is treated as a normal load here.
  if (override === RADAR_STATUS.ERROR) {
    return { host: "", frames: [], status: RADAR_STATUS.ERROR };
  }
  if (override === RADAR_STATUS.EMPTY) {
    return { host: "", frames: [], status: RADAR_STATUS.EMPTY };
  }
  if (override === RADAR_STATUS.LOADING) {
    return { host: "", frames: [], status: RADAR_STATUS.LOADING };
  }
  return null;
}

/**
 * Fetches and parses RainViewer's weather-maps catalogue, exposing the
 * radar frames plus an honest status:
 *   'loading' — first fetch in flight
 *   'ready'   — frames available
 *   'empty'   — reachable but no frames to show
 *   'error'   — unreachable / malformed response
 *
 * Frames are tagged 'past' or 'nowcast' by the adapter. The catalogue is
 * re-polled every ~5 minutes while the tab is visible. A failed *refresh*
 * keeps the last good (timestamped) frames rather than blanking a working
 * map — the timeline labels each frame's real age, so this never presents
 * stale data as current.
 *
 * `override` (default: read from the URL `?radar=` param) forces a
 * degraded state for demos / acceptance checks.
 */
export function useRadarFrames({ override } = {}) {
  const resolvedOverride =
    override === undefined ? readRadarOverride() : override;

  const [state, setState] = useState(
    () => overrideState(resolvedOverride) ?? loadingState()
  );

  const requestRef = useRef(0);
  const controllerRef = useRef(null);

  // The live network load. setState only ever runs in the promise
  // resolution (never synchronously), so this is safe to call from the
  // mount effect without triggering a cascading render.
  const fetchAndApply = useCallback(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    loadRadarState({ signal: controller.signal })
      .then((next) => {
        if (requestId !== requestRef.current) {
          return;
        }
        setState((prev) => {
          // A periodic refresh that failed (or briefly returned empty)
          // should not destroy a working radar. Keep the last good
          // frames; their timeline labels remain honest about their age.
          if (next.status !== RADAR_STATUS.READY && prev.frames.length > 0) {
            return prev;
          }
          return next;
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError" || requestId !== requestRef.current) {
          return;
        }
        setState((prev) =>
          prev.frames.length > 0
            ? prev
            : { host: "", frames: [], status: RADAR_STATUS.ERROR }
        );
      });
  }, []);

  // Public retry. Only ever called from event handlers, so the
  // synchronous forced-state setState below is fine here.
  const refetch = useCallback(() => {
    const forced = overrideState(resolvedOverride);
    if (forced) {
      requestRef.current += 1;
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      setState(forced);
      return;
    }
    fetchAndApply();
  }, [resolvedOverride, fetchAndApply]);

  useEffect(() => {
    // A forced demo state is already reflected by the initial state, so
    // there is nothing to fetch or poll.
    if (overrideState(resolvedOverride)) {
      return undefined;
    }

    fetchAndApply();

    const intervalId = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      fetchAndApply();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
    };
  }, [resolvedOverride, fetchAndApply]);

  return {
    frames: state.frames,
    host: state.host,
    status: state.status,
    override: resolvedOverride,
    refetch,
  };
}
