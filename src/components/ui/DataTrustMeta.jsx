import { memo } from "react";
import {
  formatLastUpdatedLabel,
  formatTimestampTitle,
  getAgeMinutes,
} from "../../utils/dataTrust";
import "./DataTrustMeta.css";

function DataTrustMeta({
  sourceLabel,
  lastUpdatedAt,
  nowMs,
  staleAfterMinutes = 25,
  statusLabel = "",
  titleOverride = "",
}) {
  const effectiveNowMs = Number.isFinite(Number(nowMs))
    ? Number(nowMs)
    : Number(lastUpdatedAt);
  const updatedLabel =
    typeof statusLabel === "string" && statusLabel.trim()
      ? statusLabel.trim()
      : formatLastUpdatedLabel(lastUpdatedAt, effectiveNowMs);
  const title =
    typeof titleOverride === "string" && titleOverride.trim()
      ? titleOverride.trim()
      : formatTimestampTitle(lastUpdatedAt);
  const ageMinutes = getAgeMinutes(lastUpdatedAt, effectiveNowMs);
  const isStale = Number.isFinite(ageMinutes) && ageMinutes >= staleAfterMinutes;

  return (
    <p className={`data-trust-meta ${isStale ? "is-stale" : ""}`.trim()} title={title}>
      <span className="data-source-badge">{sourceLabel}</span>
      <span className="data-updated-label">{updatedLabel}</span>
      {isStale && (
        <span className="data-stale-warning">
          Stale data ({ageMinutes}m old)
        </span>
      )}
    </p>
  );
}

export default memo(DataTrustMeta);
