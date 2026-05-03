import { toFiniteNumber } from "./numbers.js";

// Routes through the strict shared helper so a null lastUpdatedAt
// cannot be silently coerced to 0 — which would compute an
// epoch-old "stale" age and render a misleading warning.
function toTimestamp(value) {
  return toFiniteNumber(value);
}

export function getAgeMinutes(lastUpdatedAt, nowMs = Date.now()) {
  const timestamp = toTimestamp(lastUpdatedAt);
  const now = toTimestamp(nowMs);
  if (timestamp === null || now === null) {
    return null;
  }

  const ageMs = Math.max(0, now - timestamp);
  return Math.floor(ageMs / 60_000);
}

export function formatLastUpdatedLabel(lastUpdatedAt, nowMs = Date.now()) {
  const ageMinutes = getAgeMinutes(lastUpdatedAt, nowMs);
  if (ageMinutes === null) {
    return "Update pending";
  }

  if (ageMinutes < 1) {
    return "Updated just now";
  }

  if (ageMinutes < 60) {
    return `Updated ${ageMinutes}m ago`;
  }

  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (minutes === 0) {
    return `Updated ${hours}h ago`;
  }
  return `Updated ${hours}h ${minutes}m ago`;
}

export function formatTimestampTitle(lastUpdatedAt) {
  const timestamp = toTimestamp(lastUpdatedAt);
  if (timestamp === null) {
    return "No successful update yet";
  }

  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return "No successful update yet";
  }

  return `Last updated ${date.toLocaleString()}`;
}

