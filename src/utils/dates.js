// src/utils/dates.js

/**
 * Parses a bare ISO calendar date like "2024-04-19" as local midnight
 * instead of UTC midnight, which avoids day shifts in US timezones.
 */
export function parseLocalDate(isoDate) {
  if (typeof isoDate !== "string" || !isoDate.trim()) {
    return null;
  }

  const normalized = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatAsIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the current calendar date as "YYYY-MM-DD" in the given IANA
 * timezone. Open-Meteo daily entries are calendar dates in the
 * *location's* timezone (the forecast is requested with
 * `timezone=auto`), so "today" must be computed there \u2014 a viewer in
 * Tokyo reading a Honolulu forecast is usually a calendar day ahead of
 * the city they are looking at. Falls back to the viewer's local date
 * when the timezone is missing or unknown to the runtime.
 */
export function getIsoDateInTimeZone(timeZone, now = new Date()) {
  if (typeof timeZone === "string" && timeZone.trim()) {
    try {
      // en-CA formats as YYYY-MM-DD directly.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone.trim(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      // Unknown/invalid IANA name \u2014 fall through to the local date.
    }
  }

  return formatAsIsoDate(now);
}

/**
 * Returns a Date whose *device-local* wall-clock equals the current
 * wall-clock time in `timeZone`. This is the only frame in which it is
 * safe to compare against Open-Meteo's naive forecast timestamps.
 *
 * Open-Meteo (with `timezone=auto`) returns timestamps like
 * "2024-04-19T15:00" with no offset, which `new Date()` interprets in
 * the *device's* zone. Display formatters round-trip that correctly
 * (naive -> device -> device preserves the wall clock), but any
 * comparison against the real clock (`Date.now()`) is wrong by the
 * device/location offset \u2014 e.g. the hourly "Now" marker, the nowcast
 * window, and the 7-day "today" filter all drift when you view a city
 * in another zone. Reframing "now" into the location's wall clock,
 * expressed as a device-local Date, makes those comparisons line up
 * with how the forecast strings were parsed.
 *
 * Passing an explicit `now` keeps this pure (no clock read), so it is
 * safe to call from a useMemo factory. Omitting it reads the clock and
 * must only be called from a non-reactive helper.
 */
export function getZonedNow(timeZone, now = Date.now()) {
  const base = new Date(now);
  if (!Number.isFinite(base.getTime())) {
    return new Date();
  }
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    return base;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone.trim(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(base);

    const lookup = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        lookup[part.type] = part.value;
      }
    }

    // Some engines emit "24" for midnight; normalize to "00".
    const hour = lookup.hour === "24" ? "00" : lookup.hour;
    const iso = `${lookup.year}-${lookup.month}-${lookup.day}T${hour}:${lookup.minute}:${lookup.second}`;
    const zoned = new Date(iso);
    return Number.isFinite(zoned.getTime()) ? zoned : base;
  } catch {
    // Unknown IANA zone \u2014 fall back to the device clock rather than throw.
    return base;
  }
}

/**
 * Formats a date string (ISO) as a human-readable day label.
 * Returns "Today", "Tomorrow", or abbreviated weekday name.
 *
 * Pass `timeZone` (IANA name from the forecast's `meta.timezone`) so
 * "Today"/"Tomorrow" are resolved against the location's calendar day
 * rather than the viewer's. `now` is injectable for tests, and callers
 * that already track the location's current date (e.g. via a clock
 * tick) can pass `todayIso` directly so every row shares one answer.
 */
export function formatDayLabel(
  isoDate,
  { timeZone, now = new Date(), todayIso: todayIsoOverride } = {}
) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  const todayIso = todayIsoOverride ?? getIsoDateInTimeZone(timeZone, now);
  const todayDate = parseLocalDate(todayIso);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const normalized = isoDate.trim();
  if (normalized === todayIso) return "Today";
  if (normalized === formatAsIsoDate(tomorrowDate)) return "Tomorrow";

  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Short date like "Apr 18"
 */
export function formatShortDate(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a Date as a short hour label like "3 PM" or "11 AM".
 */
export function formatHour(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}
