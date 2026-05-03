import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-data: reduce)";

function readMatch() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * True when the user-agent reports the prefers-reduced-data media
 * query. Used to skip non-essential network calls (for example the
 * historical-archive comparison) when the user has asked the browser
 * to conserve bandwidth.
 *
 * Subscribes to media-query changes so the value updates if the user
 * toggles the OS-level preference mid-session.
 */
export function usePrefersReducedData() {
  const [prefersReducedData, setPrefersReducedData] = useState(readMatch);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(QUERY);
    const handleChange = (event) => {
      setPrefersReducedData(Boolean(event.matches));
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    return undefined;
  }, []);

  return prefersReducedData;
}
