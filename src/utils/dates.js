// src/utils/dates.js

import {
  ISO_DATE_LOCALE,
  formatClockHour,
  formatMonthDay,
  formatWeekdayShort,
} from "./formatters.js";

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
      // en-CA formats as YYYY-MM-DD directly. A machine format, pinned
      // in formatters.js so a change to the display locale cannot move it.
      return new Intl.DateTimeFormat(ISO_DATE_LOCALE, {
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
 * Formats a date string (ISO) as a human-readable day label.
 * Returns "Today", "Tomorrow", or abbreviated weekday name.
 *
 * Pass `timeZone` (IANA name from the forecast's `meta.timezone`) so
 * "Today"/"Tomorrow" are resolved against the location's calendar day
 * rather than the viewer's. `now` is injectable for tests, and callers
 * that already track the location's current date (e.g. via a clock
 * tick) can pass `todayIso` directly so every row shares one answer.
 */
/**
 * @param {string} isoDate
 * @param {{timeZone?: string|null, now?: Date, todayIso?: string|null}} [options]
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

  return formatWeekdayShort(date);
}

/**
 * Short date like "Apr 18"
 */
export function formatShortDate(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  return formatMonthDay(date);
}

/**
 * Formats a Date as a short hour label like "3 PM" or "11 AM".
 */
export function formatHour(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  return formatClockHour(date);
}

/**
 * "7:30 pm" from a provider timestamp such as "2026-09-16T19:30", read
 * straight from its digits. Open-Meteo's timestamps are the location's
 * wall clock (the request says `timezone=auto`), so the label needs no
 * zone arithmetic — and parsing the string with `new Date()` would read
 * it in the device's zone instead. A string carrying its own zone suffix
 * is labelled in that zone, not converted. Returns "" for anything that
 * is not an ISO-like date-time.
 */
export function formatProviderClock(value) {
  if (typeof value !== "string") {
    return "";
  }
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) {
    return "";
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return "";
  }
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
