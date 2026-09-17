import { toFiniteNumber } from "./numbers.js";
import { toEpochMs } from "./zonedTime.js";

/**
 * The index of the slot that "now" falls in, or the next one ahead of it.
 *
 * `timeZone` is the location's IANA zone. Pass it whenever `timeValues` are
 * the provider's naive local strings, which is every caller in this app: it
 * is what turns those strings into real instants, so `now` can be the real
 * clock. Callers used to reframe `now` into the location's wall clock to
 * match the way `new Date()` misreads those strings, and that cancelled out
 * on every day except the device zone's two DST days. See `zonedTime.js`.
 */
export function findWindowStartIndex(timeValues, options = {}) {
  const {
    now = Date.now(),
    windowSize = 1,
    currentSlotToleranceMs = 0,
    timeZone = null,
  } = options;

  if (!Array.isArray(timeValues) || timeValues.length === 0) {
    return -1;
  }

  // Strict coercion so an explicit null `now` (or a non-numeric value)
  // falls back to the real clock instead of silently using 0 (epoch).
  const parsedNow = toFiniteNumber(now);
  const normalizedNow = parsedNow === null ? Date.now() : parsedNow;
  const parsedWindowSize = toFiniteNumber(windowSize);
  const normalizedWindowSize = Math.max(1, Math.trunc(parsedWindowSize ?? 1));
  const parsedTolerance = toFiniteNumber(currentSlotToleranceMs);
  const normalizedTolerance = Math.max(0, parsedTolerance ?? 0);

  const validEntries = timeValues
    .map((value, index) => {
      const isDateLike =
        value instanceof Date ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value));
      if (!isDateLike) {
        return null;
      }

      const timestamp = toEpochMs(value, timeZone);
      return timestamp === null ? null : { index, timestamp };
    })
    .filter(Boolean);

  if (validEntries.length === 0) {
    return -1;
  }

  if (normalizedTolerance > 0) {
    let activeEntry = null;
    for (const entry of validEntries) {
      if (entry.timestamp > normalizedNow) {
        break;
      }
      if (normalizedNow - entry.timestamp <= normalizedTolerance) {
        activeEntry = entry;
      }
    }
    if (activeEntry) {
      return activeEntry.index;
    }
  }

  const firstFutureEntry = validEntries.find(
    (entry) => entry.timestamp >= normalizedNow
  );
  if (firstFutureEntry) {
    return firstFutureEntry.index;
  }

  const trailingStart = Math.max(0, validEntries.length - normalizedWindowSize);
  return validEntries[trailingStart].index;
}
