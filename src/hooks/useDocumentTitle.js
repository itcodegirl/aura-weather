import { useEffect } from "react";
import { formatDisplayCountry } from "../utils/locationDisplay";

/*
 * Mirror the active forecast location into <title> so users with
 * multiple weather tabs can tell them apart in the tab strip and so
 * shared / bookmarked URLs land with a meaningful page title instead
 * of the static marketing string. We intentionally do NOT include the
 * temperature in the title — it changes minute-to-minute and would
 * thrash both the tab text and any history/bookmark snapshots.
 *
 * The hook is a no-op (and preserves the static index.html title)
 * until we have a real location name. That keeps cold-start renders
 * looking branded rather than half-resolved.
 */

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function useDocumentTitle(location) {
  const name = trimString(location?.name);
  const country = formatDisplayCountry(location?.country);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!name) {
      return;
    }

    const previous = document.title;
    const suffix = country ? `, ${country}` : "";
    document.title = `${name}${suffix} · Aura Weather`;

    return () => {
      document.title = previous;
    };
  }, [name, country]);
}
