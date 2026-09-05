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

  /*
   * Only credit NOAA/NWS where it actually supplied something. Its alerts
   * are U.S.-only, so for most of the world alertsStatus is "unsupported"
   * and no NWS request contributed anything to what is on screen -- the
   * footer was naming a source the page had not used, on the one strip whose
   * whole job is saying where the data came from (audit O-02).
   * SourceHealthPanel already branches on this status; this is the same
   * reading, applied to the line every viewer sees rather than the panel
   * they have to open.
   */
  const alertsStatus = trustMeta?.alertsStatus ?? null;
  const sources = ["Open-Meteo"];
  if (alertsStatus === "ready") {
    sources.push("NOAA/NWS");
  }
  const sourceNames = sources.join(" + ");
  const sourceStr = updateTime
    ? `${sourceNames} · updated ${updateTime}`
    : sourceNames;

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
