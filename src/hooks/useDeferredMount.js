import { useEffect, useState } from "react";

const isBrowser = typeof window !== "undefined";

/**
 * Returns true once the browser is idle, or after `fallbackDelay` ms,
 * once `enabled` is truthy. Used to defer mounting non-critical panels
 * so the first paint can stabilize. In non-browser environments the
 * deferred branch is unreachable, so the initial state is true there.
 */
export function useDeferredMount(enabled, options = {}) {
  const { idleTimeout = 700, fallbackDelay = 180 } = options;
  const [isReady, setIsReady] = useState(!isBrowser);

  useEffect(() => {
    if (!enabled || isReady || !isBrowser) {
      return undefined;
    }

    let timeoutId = null;
    let idleId = null;

    const reveal = () => {
      setIsReady(true);
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(reveal, { timeout: idleTimeout });
    } else {
      timeoutId = window.setTimeout(reveal, fallbackDelay);
    }

    return () => {
      if (
        idleId !== null &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, isReady, idleTimeout, fallbackDelay]);

  return isReady;
}
