import { useCallback, useEffect, useState } from "react";

// RainViewer's own example player advances a frame every ~500ms.
export const RADAR_FRAME_DELAY_MS = 500;

/**
 * Owns the radar animation state shared by the map (which frame is
 * painted) and the timeline (the controls). Kept in one place so the two
 * never disagree about the active index or play state.
 *
 * When frames first arrive it jumps to `preferredIndex` (the latest
 * observed frame, so the resting view shows "now"); later refreshes only
 * clamp the index into range rather than yanking the user off their
 * scrubbed position.
 *
 * Playback is user-initiated only — `isPlaying` starts false and nothing
 * here ever starts the loop on its own — so `prefers-reduced-motion` is
 * already honored without gating the Play control. Gating it instead
 * left an enabled, focusable button that did nothing when activated.
 */
export function useRadarAnimation(frameCount, { preferredIndex = null } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // The frame-list size we last reconciled the index against. Comparing
  // it to the current size *during render* (React's supported
  // alternative to a setState-in-effect) lets us re-home the index when
  // frames first load or the list resizes, without an extra commit.
  const [reconciledCount, setReconciledCount] = useState(-1);

  if (frameCount !== reconciledCount) {
    setReconciledCount(frameCount);
    if (frameCount <= 0) {
      if (activeIndex !== 0) {
        setActiveIndex(0);
      }
    } else if (reconciledCount <= 0) {
      // Frames just became available — jump to the preferred frame.
      const maxIndex = frameCount - 1;
      const target =
        preferredIndex === null
          ? maxIndex
          : Math.max(0, Math.min(maxIndex, preferredIndex));
      if (target !== activeIndex) {
        setActiveIndex(target);
      }
    } else if (activeIndex > frameCount - 1) {
      // The list shrank on refresh — clamp back into range.
      setActiveIndex(frameCount - 1);
    }
  }

  // Auto-play loop. setState here runs inside the interval callback (not
  // synchronously in the effect body), so it advances frames without a
  // cascading render. The advance is paused while the tab is hidden — a
  // backgrounded player otherwise keeps flipping ~15 radar tile-layer
  // opacities twice a second for a view nobody is looking at.
  useEffect(() => {
    if (!isPlaying || frameCount <= 1) {
      return undefined;
    }
    const advance = () => setActiveIndex((idx) => (idx + 1) % frameCount);

    if (typeof document === "undefined") {
      const intervalId = setInterval(advance, RADAR_FRAME_DELAY_MS);
      return () => clearInterval(intervalId);
    }

    let intervalId = null;
    const start = () => {
      if (intervalId === null) {
        intervalId = setInterval(advance, RADAR_FRAME_DELAY_MS);
      }
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isPlaying, frameCount]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => {
    setIsPlaying((playing) => !playing);
  }, []);

  const step = useCallback(
    (delta) => {
      setIsPlaying(false);
      setActiveIndex((idx) => {
        if (frameCount <= 0) {
          return 0;
        }
        return (idx + delta + frameCount) % frameCount;
      });
    },
    [frameCount]
  );

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  const seek = useCallback(
    (index) => {
      setIsPlaying(false);
      setActiveIndex(() => {
        if (frameCount <= 0) {
          return 0;
        }
        return Math.max(0, Math.min(frameCount - 1, Math.round(index)));
      });
    },
    [frameCount]
  );

  return { activeIndex, isPlaying, pause, toggle, next, prev, seek };
}
