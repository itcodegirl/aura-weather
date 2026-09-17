/*
 * One home for the display locale, and the date/time formatters that use it.
 *
 * Before this module the locale was decided at the call site, 21 times:
 * "en-US" was hardcoded in 15 display formatters, while the trust footer, the
 * status stack, the sync panel and the "Last updated" tooltip passed no locale
 * at all and rendered in whatever the browser was set to. A reader in Berlin
 * got "16.09.2026, 19:30" in the footer and "Conditions as of 7:30 pm" on the
 * hero, on the same screen, with the rest of the copy in English. Two clocks,
 * one page.
 *
 * The rule now: any string a person reads goes through a formatter here, and
 * the locale is named once, below.
 *
 * ── Display locale vs. machine locale ──────────────────────────────────────
 *
 * Not every locale in this codebase is a display decision, and sweeping them
 * together would be a bug rather than a cleanup. Two of the old "en-US"
 * literals never rendered anything: they drive `formatToParts` to pull numeric
 * wall-clock components out of a zone. Their locale is load-bearing — it is
 * chosen because its output shape is stable and parseable, not because of how
 * it reads. `ISO_DATE_LOCALE` and `PARTS_LOCALE` exist so that changing what
 * people see can never quietly change how dates are computed.
 */

/**
 * The one locale every user-facing date and time is formatted in.
 *
 * It is a constant rather than the browser's locale on purpose: the app's copy
 * is written in English, and a German date format wrapped in English sentences
 * reads as a bug, not as localisation. When Aura is actually translated, this
 * is the single line that changes — or becomes a user preference — and every
 * formatter below follows it.
 */
export const DISPLAY_LOCALE = "en-US";

/**
 * Renders YYYY-MM-DD. A machine format, not a display choice — see the note
 * at the top of this file. Do not swap this for `DISPLAY_LOCALE`.
 */
export const ISO_DATE_LOCALE = "en-CA";

/**
 * Used with `formatToParts` to read numeric date/time components out of a
 * timezone. A machine format, not a display choice.
 */
export const PARTS_LOCALE = "en-US";

/*
 * Constructing an `Intl.DateTimeFormat` is the expensive part of formatting a
 * date; formatting with an existing one is cheap. `toLocaleTimeString` builds
 * a fresh one on every call, so a card that labels 24 hourly slots built 24.
 * Keyed by the options and zone, which is everything that distinguishes one.
 */
const formatterCache = new Map();

function getFormatter(options, timeZone) {
  const key = `${timeZone ?? ""}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) {
    return cached;
  }
  // Only cache after a successful construction: an unknown IANA name throws
  // here, and caching the attempt would poison the key for a valid one.
  const formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  });
  formatterCache.set(key, formatter);
  return formatter;
}

/**
 * Formats `date` in `timeZone` when one is given and the runtime knows it,
 * and in the viewer's own zone otherwise.
 *
 * The fallback is the point. Three call sites had each hand-rolled this same
 * try/catch, because `Intl.DateTimeFormat` throws a `RangeError` on an IANA
 * name it does not carry — and the zone comes from the weather provider, not
 * from us. Falling back to the viewer's clock shows a real time in the wrong
 * zone; throwing would blank the card.
 *
 * @param {Date} date
 * @param {Intl.DateTimeFormatOptions} options
 * @param {string|null|undefined} timeZone IANA name, e.g. "America/Chicago"
 * @returns {string} "" when `date` is not a usable Date
 */
export function formatInZone(date, options, timeZone) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "";
  }

  const zone =
    typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : null;

  if (zone) {
    try {
      return getFormatter(options, zone).format(date);
    } catch {
      // Unknown IANA name — fall through to the viewer's clock.
    }
  }

  return getFormatter(options).format(date);
}

const CLOCK_HOUR_OPTIONS = { hour: "numeric", hour12: true };
const CLOCK_TIME_OPTIONS = { hour: "numeric", minute: "2-digit", hour12: true };
const MONTH_DAY_OPTIONS = { month: "short", day: "numeric" };
const WEEKDAY_SHORT_OPTIONS = { weekday: "short" };
const STAMP_OPTIONS = { ...MONTH_DAY_OPTIONS, ...CLOCK_TIME_OPTIONS };

/** "3 PM" — the hour alone, for labels where minutes would be noise. */
export function formatClockHour(date, timeZone) {
  return formatInZone(date, CLOCK_HOUR_OPTIONS, timeZone);
}

/** "7:30 PM" — the usual clock reading. */
export function formatClockTime(date, timeZone) {
  return formatInZone(date, CLOCK_TIME_OPTIONS, timeZone);
}

/** "Apr 18" — a calendar day without the year. */
export function formatMonthDay(date, timeZone) {
  return formatInZone(date, MONTH_DAY_OPTIONS, timeZone);
}

/** "Mon" — the weekday alone, for forecast columns. */
export function formatWeekdayShort(date, timeZone) {
  return formatInZone(date, WEEKDAY_SHORT_OPTIONS, timeZone);
}

/**
 * "Apr 18, 7:30 PM" — when something happened, near enough to now that the
 * year carries no information. Every "captured at" / "last updated" stamp in
 * the app uses this shape so they can be compared at a glance.
 */
export function formatStamp(date, timeZone) {
  return formatInZone(date, STAMP_OPTIONS, timeZone);
}

/** Test seam: the cache is a module-level singleton and leaks across cases. */
export const formattersInternals = {
  formatterCache,
  resetCache() {
    formatterCache.clear();
  },
};
