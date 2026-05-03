/**
 * Strict numeric coercion used at API and domain boundaries.
 *
 * Plain Number() coercion treats null, undefined, "" and false as 0,
 * which silently turns missing fields into valid-looking 0°F / 0% / 0 hPa
 * readings throughout the dashboard. toFiniteNumber rejects those
 * inputs explicitly and only returns numbers that arrived as a real
 * number, numeric string, or numeric primitive.
 *
 * Returns the parsed number on success or null otherwise.
 */
export function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return null;
  }
  if (typeof value === "object") {
    // Arrays and objects coerce in surprising ways (Number([]) === 0,
    // Number([42]) === 42). Reject them so accidental shape mismatches
    // surface as missing data instead of fake readings.
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
