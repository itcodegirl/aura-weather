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
 * Pass `{ timeZone }` (the forecast location's IANA zone) so "Today" /
 * "Tomorrow" are anchored to the location's calendar day, not the
 * device's \u2014 otherwise a user viewing a city in another zone can see
 * the wrong day labelled "Today". See {@link getZonedNow}.
 */
export function formatDayLabel(isoDate, options = {}) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  const today = getZonedNow(options.timeZone);
  today.setHours(0, 0, 0, 0);

  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((compareDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

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
