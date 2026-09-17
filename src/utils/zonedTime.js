import { PARTS_LOCALE } from "./formatters.js";

/*
 * Turning Open-Meteo's timestamps into real instants.
 *
 * The provider sends naive local strings — "2026-11-01T01:00", with no zone
 * and no offset — because the request asks for `timezone=auto`. `new Date()`
 * reads such a string in the *device's* zone, so the app was comparing a
 * Chicago forecast against a clock interpreted in Berlin. The existing
 * workaround reframed "now" into the location's wall clock so both sides were
 * wrong the same way, and for 363 days a year that cancels out.
 *
 * It does not cancel on the device zone's own DST days, because the mapping
 * from wall clock to instant is not one-to-one there. Measured in
 * America/Chicago [ran: TZ=America/Chicago node]:
 *
 *   2026-03-08T02:00 and 03:00  → the same instant (gap 0 ms)
 *   2026-11-01T01:00 → 02:00    → 7,200,000 ms
 *
 * Two hourly slots collapse onto one instant in spring, and an hour is
 * unreachable in autumn. The "Now" marker, the nowcast window, the pressure
 * anchor and the hour labels all ride on that comparison.
 *
 * ── Why not `utc_offset_seconds` ──────────────────────────────────────────
 *
 * The obvious fix is to add the offset the payload already carries. It is
 * wrong, and in a way that is easy to miss: `utc_offset_seconds` is a single
 * scalar — the offset in force when the request was made. The recorded
 * September response for America/Chicago carries -18000 (CDT), and the
 * forecast window it describes runs seven days forward. Apply that one offset
 * to a window containing the *location's* own transition and every timestamp
 * after it lands an hour out [ran: node, see the check below].
 *
 * So this converts per timestamp, asking the runtime what offset that zone was
 * actually on at that moment. The cost is one `Intl` lookup per conversion,
 * against a cached formatter; the benefit is that the answer is right on all
 * 365 days rather than on a different 363 of them.
 */

const partsFormatterByZone = new Map();

function partsFormatterFor(timeZone) {
  const cached = partsFormatterByZone.get(timeZone);
  if (cached) {
    return cached;
  }
  // Throws a RangeError on an IANA name this runtime does not carry; the
  // caller catches it. Not cached until it constructs, so a bad name cannot
  // poison the key.
  const formatter = new Intl.DateTimeFormat(PARTS_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  partsFormatterByZone.set(timeZone, formatter);
  return formatter;
}

/**
 * The offset of `timeZone` from UTC at `epochMs`, in milliseconds.
 *
 * Works by asking what wall clock that zone shows at that instant, reading it
 * back as though it were UTC, and taking the difference. That is the only way
 * to get a zone's offset out of the platform without the Temporal API.
 */
function zoneOffsetMsAt(epochMs, timeZone) {
  const parts = partsFormatterFor(timeZone).formatToParts(new Date(epochMs));
  const lookup = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }
  // Some runtimes render midnight as hour "24" rather than "00".
  const hour = lookup.hour === "24" ? 0 : Number(lookup.hour);
  const asIfUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    hour,
    Number(lookup.minute),
    Number(lookup.second)
  );
  return asIfUtc - epochMs;
}

const NAIVE_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A naive local timestamp plus an IANA zone, as a real epoch in milliseconds.
 *
 * Two passes, because the offset depends on the instant we are trying to find:
 * guess using the offset at the string read as UTC, then correct with the
 * offset actually in force at that guess. One correction is enough for every
 * real-world zone, whose transitions are far larger than the offsets involved.
 *
 * **The two days the answer cannot be a single instant**, and what this does:
 *
 * - A wall clock that never happened (02:00 on a spring-forward morning) has
 *   no instant to return. It resolves to the same instant as 01:00, which is
 *   when that reading would have been taken had the clock not jumped.
 * - A wall clock that happened twice (01:00 on a fall-back morning) has two.
 *   This returns the *first*, the pre-transition one, matching the convention
 *   `Temporal` calls compatible disambiguation. The provider emits one entry
 *   per wall-clock label, so one of the two real hours is not in the series
 *   either way; taking the earlier keeps the series monotonic.
 *
 * @param {string} value naive timestamp, e.g. "2026-11-01T01:00"
 * @param {string} timeZone IANA name, e.g. "America/Chicago"
 * @returns {number|null} epoch ms, or null if either argument is unusable
 */
export function zonedWallClockToEpoch(value, timeZone) {
  if (typeof value !== "string" || typeof timeZone !== "string") {
    return null;
  }
  const match = NAIVE_TIMESTAMP.exec(value.trim());
  if (!match) {
    return null;
  }
  const zone = timeZone.trim();
  if (!zone) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const asIfUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0)
  );
  if (!Number.isFinite(asIfUtc)) {
    return null;
  }

  try {
    const guess = asIfUtc - zoneOffsetMsAt(asIfUtc, zone);
    return asIfUtc - zoneOffsetMsAt(guess, zone);
  } catch {
    // Unknown IANA name — the caller decides what to do without a zone.
    return null;
  }
}

/**
 * Any timestamp this app handles, as a real epoch in milliseconds.
 *
 * A `Date` or a number is already an instant and passes through. A string is
 * the provider's naive local form: with a zone it is converted properly, and
 * without one it falls back to `Date.parse`, which reads it in the device's
 * zone — the old behaviour, kept only so a caller that has no zone still gets
 * an ordering rather than nothing.
 *
 * @returns {number|null} epoch ms, or null when the value is not a timestamp
 */
export function toEpochMs(value, timeZone) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const zoned = zonedWallClockToEpoch(value, timeZone);
  if (zoned !== null) {
    return zoned;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Test seam: the formatter cache is a module-level singleton. */
export const zonedTimeInternals = {
  partsFormatterByZone,
  zoneOffsetMsAt,
  resetCache() {
    partsFormatterByZone.clear();
  },
};
