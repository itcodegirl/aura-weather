import { toFiniteNumber } from "./numbers.js";
import { formatClockTime } from "./formatters.js";
import { toEpochMs } from "./zonedTime.js";

/*
 * Sunrise and sunset arrive as the provider's naive location-local strings,
 * the same shape as the hourly series. These helpers used to parse them with
 * `new Date()` — the device's zone — and take a "now" the caller had already
 * reframed to match, so both sides were wrong together. `zonedTime.js` says
 * why that stops working twice a year; here it meant the golden-hour wash and
 * the daylight gate could fire an hour out on those days.
 *
 * They now resolve the sun times through the location's zone and compare
 * against the real clock. Every one of them still answers false or null when
 * it cannot place "now" against the sun, rather than guessing.
 */
function toSunEpoch(value, timeZone) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (!value) {
    return null;
  }
  return toEpochMs(value, timeZone);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toValidDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatSunClock(value, options = {}) {
  const { fallback = "\u2014", maxFutureDays } = options;
  const date = toValidDate(value);
  if (!date) {
    return fallback;
  }

  // Strict coercion: a null/undefined/boolean/array maxFutureDays must be
  // treated as "no limit", not silently coerced (Number(null) === 0 would
  // block every future date, Number(true) === 1 would cap at 1 day).
  const maxFutureDaysNumber = toFiniteNumber(maxFutureDays);
  if (maxFutureDaysNumber !== null && maxFutureDaysNumber >= 0) {
    const maxAllowedTime = Date.now() + maxFutureDaysNumber * DAY_MS;
    if (date.getTime() > maxAllowedTime) {
      return fallback;
    }
  }

  return formatClockTime(date);
}

/*
 * Returns "sunrise" or "sunset" if the current moment falls within
 * +/- toleranceMinutes of the given sunrise / sunset timestamp; null
 * otherwise. Used by HeroCard to apply an earned warm wash that only
 * surfaces during the actual golden-hour windows of the day —
 * deliberately quiet during the rest.
 */
export function getSunlightPhase(sunrise, sunset, nowMs, options = {}) {
  const { toleranceMinutes = 30, timeZone = null } = options;
  const tolerance = toFiniteNumber(toleranceMinutes);
  if (tolerance === null || tolerance <= 0) {
    return null;
  }

  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return null;
  }

  const toleranceMs = tolerance * 60_000;

  const sunriseMs = toSunEpoch(sunrise, timeZone);
  if (sunriseMs !== null && Math.abs(now - sunriseMs) <= toleranceMs) {
    return "sunrise";
  }

  const sunsetMs = toSunEpoch(sunset, timeZone);
  if (sunsetMs !== null && Math.abs(now - sunsetMs) <= toleranceMs) {
    return "sunset";
  }

  return null;
}

/*
 * Whether `nowMs` falls inside today's daylight window. `sunrise` and
 * `sunset` are the provider's naive location-local timestamps; `timeZone`
 * is what turns them into real instants, so `nowMs` is the real clock.
 *
 * Returns false, never a guess, when any input is missing or invalid: a
 * caller that cannot place "now" against the sun must not surface advice
 * that only makes sense in daylight. Inclusive at both ends, matching the
 * gate buildAtmosphereReading has always used.
 */
export function isDaylight(sunrise, sunset, nowMs, timeZone) {
  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return false;
  }
  const sunriseMs = toSunEpoch(sunrise, timeZone);
  const sunsetMs = toSunEpoch(sunset, timeZone);
  if (sunriseMs === null || sunsetMs === null) {
    return false;
  }
  return now >= sunriseMs && now <= sunsetMs;
}

/*
 * True only when the clock can be placed AFTER today's sunset. Distinct
 * from `!isDaylight(...)`, which is also true for an unknown clock, missing
 * sun times, and the hours before sunrise — isDaylight collapses those into
 * one false because a caller that cannot place "now" must not surface
 * daylight advice.
 *
 * A caller that cannot drop its surface needs the narrower question. The
 * hero's UV panel always renders when a reading exists (the trust contract
 * owes the reader the number), so it must choose a tense rather than
 * suppress. Past tense asserts the day has ended, which is the harmful
 * direction to get wrong: telling someone the peak "was" high while it is
 * actually peaking withdraws protection they still need. So an unknown
 * clock, missing sun times, and the pre-dawn hours all answer false here
 * and leave the caller in present tense — the tense that fails safe.
 */
export function isAfterSunset(sunset, nowMs, timeZone) {
  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return false;
  }
  const sunsetMs = toSunEpoch(sunset, timeZone);
  if (sunsetMs === null) {
    return false;
  }
  return now > sunsetMs;
}

/*
 * Fraction of today's daylight already elapsed, clamped to 0..1. Returns
 * null when sunrise, sunset, or nowMs is missing/invalid, or when the pair
 * spans no positive daylight — callers must not draw a sun position they
 * cannot compute.
 */
export function getDaylightProgress(sunrise, sunset, nowMs, timeZone) {
  const sunriseMs = toSunEpoch(sunrise, timeZone);
  const sunsetMs = toSunEpoch(sunset, timeZone);
  if (sunriseMs === null || sunsetMs === null) {
    return null;
  }

  const spanMs = sunsetMs - sunriseMs;
  if (spanMs <= 0) {
    return null;
  }

  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return null;
  }

  return Math.max(0, Math.min(1, (now - sunriseMs) / spanMs));
}

export function formatDaylightLengthLabel(
  sunrise,
  sunset,
  options = {}
) {
  const { fallback = null, timeZone = null } = options;
  const sunriseMs = toSunEpoch(sunrise, timeZone);
  const sunsetMs = toSunEpoch(sunset, timeZone);
  if (sunriseMs === null || sunsetMs === null) {
    return fallback;
  }

  // A real elapsed duration, so both ends resolve through the zone: on the
  // location's own transition day the naive difference is an hour out from
  // the daylight anyone there actually gets.
  let diffMs = sunsetMs - sunriseMs;
  if (diffMs <= 0) {
    diffMs += DAY_MS;
  }

  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}
