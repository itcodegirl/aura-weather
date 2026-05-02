export function findWindowStartIndex(timeValues, options = {}) {
  const { now = Date.now(), windowSize = 1, currentSlotToleranceMs = 0 } = options;

  if (!Array.isArray(timeValues) || timeValues.length === 0) {
    return -1;
  }

  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const normalizedWindowSize = Math.max(1, Math.trunc(Number(windowSize) || 1));
  const normalizedTolerance = Math.max(
    0,
    Number.isFinite(Number(currentSlotToleranceMs))
      ? Number(currentSlotToleranceMs)
      : 0
  );

  const validEntries = timeValues
    .map((value, index) => {
      const isDateLike =
        value instanceof Date ||
        typeof value === "string" ||
        (typeof value === "number" && Number.isFinite(value));
      if (!isDateLike) {
        return null;
      }

      const timestamp = new Date(value).getTime();
      return Number.isFinite(timestamp) ? { index, timestamp } : null;
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
