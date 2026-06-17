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
 * scrubbed position. Honors `prefers-reduced-motion` by never
 * auto-playing.
 */
export function useRadarAnimation(
  frameCount,
  { preferredIndex = null, allowAutoPlay = true } = {}
) {
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
  // cascading render.
  useEffect(() => {
    if (!isPlaying || frameCount <= 1) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      setActiveIndex((idx) => (idx + 1) % frameCount);
    }, RADAR_FRAME_DELAY_MS);
    return () => clearInterval(intervalId);
  }, [isPlaying, frameCount]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => {
    setIsPlaying((playing) => (playing ? false : allowAutoPlay));
  }, [allowAutoPlay]);

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
