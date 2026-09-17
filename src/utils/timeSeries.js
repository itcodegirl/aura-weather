import { toFiniteNumber } from "./numbers.js";
import { toEpochMs } from "./zonedTime.js";

/*
 * Where "now" sits in a series of provider timestamps — and, when it sits off
 * the end, saying so.
 *
 * ── What this used to do, and why it was wrong ────────────────────────────
 *
 * The old `findWindowStartIndex` had three branches and returned a bare
 * number: the slot containing now, the first slot ahead of now, or — when
 * every slot was behind now — the start of the TRAILING window. That last
 * branch returned a real, in-range index. It was indistinguishable from a hit.
 *
 * Every caller guards with `if (index < 0)`, so none of them ever fired on a
 * series that had run out. The tail was read as "now" and rendered as now.
 * Measured on an eight-slot nowcast series whose last reading was 48 hours
 * old, the card printed:
 *
 *   "Heavy rain likely now, lasting through most of the window"
 *
 * Not stale data shown as stale — a two-day-old model run asserting, in the
 * present tense, that it is raining. That is the one thing this app's trust
 * contract exists to prevent: missing renders as "—", and a plausible wrong
 * answer is worse than no answer.
 *
 * ── The shape of the signal, and why it is an object ──────────────────────
 *
 * There are now three outcomes and they are not orderable, so a number cannot
 * carry them. The two candidates were `null` and a result object.
 *
 * `null` is the dangerous one, for a reason specific to the callers: every
 * guard in this codebase reads `if (index < 0)`, and `null < 0` is FALSE in
 * JavaScript (null coerces to 0). A caller that was not updated would sail
 * through its own guard and then index the series with null, reading
 * `undefined` and rendering nothing — silently. That is the same family of
 * failure as the bug being fixed, so it is not an acceptable signal for it.
 *
 * An object breaks loudly instead: `result < 0` is false, `series[result]` is
 * `undefined` immediately, and the first run of any unconverted caller fails.
 * It also carries `staleByMs`, so a caller can say how old the data is rather
 * than only that it is unusable.
 *
 * The function was renamed with the return type. `findWindowStartIndex`
 * promised an index and no longer returns one, and a name that lies is how a
 * stale mental model survives a refactor.
 *
 * ── `windowSize` is gone ──────────────────────────────────────────────────
 *
 * Its only job was computing the trailing start for the clamp. With the clamp
 * replaced by a report, nothing reads it, and an ignored parameter is the
 * same dead-input smell this codebase removed from `ArcGauge`. Callers keep
 * their own window constants for their own slicing, which is where the window
 * was always actually applied.
 */

/**
 * @typedef {"ok" | "empty" | "stale"} WindowStatus
 *
 * `ok`    — `index` is the slot containing now, or the first one ahead of it.
 * `empty` — the series holds no usable timestamps at all.
 * `stale` — every usable timestamp lies behind now; `staleByMs` says by how
 *           much, measured from the last one. There is no usable index, and
 *           `index` is -1 rather than the tail so it cannot be read as one.
 *
 * @typedef {{index: number, status: WindowStatus, staleByMs: number|null}} WindowStart
 */

/** No usable slot, and the reason. */
function unusable(status, staleByMs = null) {
  return { index: -1, status, staleByMs };
}

/**
 * Resolves where `now` falls in a series of provider timestamps.
 *
 * `timeZone` is the location's IANA zone. Pass it whenever `timeValues` are
 * the provider's naive local strings, which is every caller in this app: it
 * is what turns those strings into real instants, so `now` can be the real
 * clock. Callers used to reframe `now` into the location's wall clock to
 * match the way `new Date()` misreads those strings, and that cancelled out
 * on every day except the device zone's two DST days. See `zonedTime.js`.
 *
 * @param {unknown} timeValues
 * @param {{now?: number|null, currentSlotToleranceMs?: number|null, timeZone?: string|null}} [options]
 * @returns {WindowStart}
 */
export function resolveWindowStart(timeValues, options = {}) {
  const { now = Date.now(), currentSlotToleranceMs = 0, timeZone = null } = options;

  if (!Array.isArray(timeValues) || timeValues.length === 0) {
    return unusable("empty");
  }

  // Strict coercion so an explicit null `now` (or a non-numeric value)
  // falls back to the real clock instead of silently using 0 (epoch).
  const parsedNow = toFiniteNumber(now);
  const normalizedNow = parsedNow === null ? Date.now() : parsedNow;
  const parsedTolerance = toFiniteNumber(currentSlotToleranceMs);
  const normalizedTolerance = Math.max(0, parsedTolerance ?? 0);

  const validEntries = [];
  for (const [index, value] of timeValues.entries()) {
    const isDateLike =
      value instanceof Date ||
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value));
    if (!isDateLike) {
      continue;
    }
    const timestamp = toEpochMs(value, timeZone);
    if (timestamp !== null) {
      validEntries.push({ index, timestamp });
    }
  }

  if (validEntries.length === 0) {
    return unusable("empty");
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
      return { index: activeEntry.index, status: "ok", staleByMs: null };
    }
  }

  const firstFutureEntry = validEntries.find(
    (entry) => entry.timestamp >= normalizedNow
  );
  if (firstFutureEntry) {
    return { index: firstFutureEntry.index, status: "ok", staleByMs: null };
  }

  // Every slot is behind now. This is where the clamp used to be.
  const lastEntry = validEntries[validEntries.length - 1];
  return unusable("stale", normalizedNow - lastEntry.timestamp);
}
