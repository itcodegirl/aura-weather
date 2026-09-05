import { memo } from "react";
import { Clock } from "lucide-react";
import { useTimeNow } from "../hooks/useTimeNow";
import { getIsoDateInTimeZone } from "../utils/dates";
import { toFiniteNumber } from "../utils/numbers";
import "./DataTrustFooter.css";

function formatCoords(lat, lon) {
  if (lat == null || lon == null) return null;
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}

/*
 * A bare clock reads as today. This footer is the one freshness surface with
 * no staleness signal of its own — the hero's trust pill says "Saved
 * forecast", but "updated 3:42 PM" beside it says the snapshot is hours old,
 * not two days old, and a restored 48h cache stamped that way is the trust
 * contract's exact failure mode.
 *
 * So the clock alone is used only when the fetch can be CONFIRMED to fall on
 * today's date; otherwise the date is spelled out. An unusable clock takes
 * the dated branch too: unable to confirm "today" is not licence to imply
 * it, and a date is never wrong, only wordier.
 *
 * The comparison is device-local because the rendered time is device-local
 * ("updated" is an event in the reader's own day, not the forecast
 * location's). Keeping both in one frame is what stops a midnight-adjacent
 * fetch from being labelled by one clock and dated by another.
 */
function formatUpdateTime(fetchedAt, nowMs) {
  if (!fetchedAt) return null;
  const d = new Date(fetchedAt);
  if (!Number.isFinite(d.getTime())) return null;

  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const now = toFiniteNumber(nowMs);
  if (
    now !== null &&
    getIsoDateInTimeZone(null, d) === getIsoDateInTimeZone(null, new Date(now))
  ) {
    return time;
  }

  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${date}, ${time}`;
}

function DataTrustFooter({ weather, location, trustMeta }) {
  // Shares the app-wide minute bucket every other card already subscribes to,
  // so this adds a subscriber rather than a timer. The stamp only changes at
  // midnight, but the tick is what makes it change then.
  const nowMs = useTimeNow();
  const timezone = weather?.meta?.timezone ?? null;
  const coords = formatCoords(location?.lat, location?.lon);
  const updateTime = formatUpdateTime(trustMeta?.weatherFetchedAt, nowMs);

  const locationStr = [timezone, coords].filter(Boolean).join(" · ");
  const sourceStr = updateTime
    ? `Open-Meteo + NOAA/NWS · updated ${updateTime}`
    : "Open-Meteo + NOAA/NWS";

  return (
    <footer className="data-trust-footer" aria-label="Data sources and location">
      <span className="data-trust-footer-location">
        <Clock size={12} aria-hidden="true" className="data-trust-footer-icon" />
        {locationStr || "—"}
      </span>
      <span className="data-trust-footer-source">
        <span className="data-trust-footer-dot" aria-hidden="true" />
        {sourceStr}
      </span>
    </footer>
  );
}

export default memo(DataTrustFooter);
