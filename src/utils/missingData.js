export const MISSING_VALUE_DASH = "—";
export const MISSING_VALUE_LABEL = "Data unavailable";

export function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function hasFiniteValue(value) {
  return toFiniteNumber(value) !== null;
}

export function formatMissingValue({ unavailable = false } = {}) {
  return unavailable ? MISSING_VALUE_LABEL : MISSING_VALUE_DASH;
}
