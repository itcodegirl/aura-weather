import { memo } from "react";
import { Clock } from "lucide-react";
import "./DataTrustFooter.css";

function formatCoords(lat, lon) {
  if (lat == null || lon == null) return null;
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr}, ${lonStr}`;
}

function formatUpdateTime(fetchedAt) {
  if (!fetchedAt) return null;
  const d = new Date(fetchedAt);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function DataTrustFooter({ weather, location, trustMeta }) {
  const timezone = weather?.meta?.timezone ?? null;
  const coords = formatCoords(location?.lat, location?.lon);
  const updateTime = formatUpdateTime(trustMeta?.weatherFetchedAt);

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
