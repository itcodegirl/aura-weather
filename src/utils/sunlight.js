import { toFiniteNumber } from "./numbers.js";
import { getZonedNow } from "./dates.js";

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

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/*
 * Returns "sunrise" or "sunset" if the current moment falls within
 * +/- toleranceMinutes of the given sunrise / sunset timestamp; null
 * otherwise. Used by HeroCard to apply an earned warm wash that only
 * surfaces during the actual golden-hour windows of the day —
 * deliberately quiet during the rest.
 */
export function getSunlightPhase(sunrise, sunset, nowMs, options = {}) {
  const { toleranceMinutes = 30 } = options;
  const tolerance = toFiniteNumber(toleranceMinutes);
  if (tolerance === null || tolerance <= 0) {
    return null;
  }

  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return null;
  }

  const toleranceMs = tolerance * 60_000;

  const sunriseDate = toValidDate(sunrise);
  if (sunriseDate && Math.abs(now - sunriseDate.getTime()) <= toleranceMs) {
    return "sunrise";
  }

  const sunsetDate = toValidDate(sunset);
  if (sunsetDate && Math.abs(now - sunsetDate.getTime()) <= toleranceMs) {
    return "sunset";
  }

  return null;
}

/*
 * Whether `zonedNowMs` falls inside today's daylight window. `sunrise` and
 * `sunset` are the provider's naive location-local timestamps, so the caller
 * must pass a "now" already reframed into that clock (see getZonedNowMs) —
 * comparing the raw device epoch pins a remote city to the device's day.
 *
 * Returns false, never a guess, when any input is missing or invalid: a
 * caller that cannot place "now" against the sun must not surface advice
 * that only makes sense in daylight. Inclusive at both ends, matching the
 * gate buildAtmosphereReading has always used.
 */
export function isDaylight(sunrise, sunset, zonedNowMs) {
  const now = toFiniteNumber(zonedNowMs);
  if (now === null) {
    return false;
  }
  const sunriseDate = toValidDate(sunrise);
  const sunsetDate = toValidDate(sunset);
  if (!sunriseDate || !sunsetDate) {
    return false;
  }
  return now >= sunriseDate.getTime() && now <= sunsetDate.getTime();
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
export function isAfterSunset(sunset, zonedNowMs) {
  const now = toFiniteNumber(zonedNowMs);
  if (now === null) {
    return false;
  }
  const sunsetDate = toValidDate(sunset);
  if (!sunsetDate) {
    return false;
  }
  return now > sunsetDate.getTime();
}

/*
 * Reframes a real epoch instant into the location's wall clock, returned as
 * epoch ms of a device-local Date carrying those wall-clock parts. Provider
 * sunrise/sunset timestamps are naive location-local strings that parse in
 * the device zone, so any comparison against "now" must first move "now"
 * into the same frame — comparing the raw device epoch pins remote-city
 * results to the device's clock, not the location's. Returns null when
 * nowMs is not a finite number: an unknown "now" must stay unknown, never
 * silently become the device's current time.
 */
export function getZonedNowMs(timeZone, nowMs) {
  const now = toFiniteNumber(nowMs);
  if (now === null) {
    return null;
  }
  return getZonedNow(timeZone, now).getTime();
}

/*
 * Fraction of today's daylight already elapsed, clamped to 0..1, in the
 * location's frame (see getZonedNowMs). Returns null when sunrise, sunset,
 * or nowMs is missing/invalid, or when the sunrise/sunset pair spans no
 * positive daylight interval — callers must not draw a sun position they
 * cannot compute.
 */
export function getDaylightProgress(sunrise, sunset, nowMs, timeZone) {
  const sunriseDate = toValidDate(sunrise);
  const sunsetDate = toValidDate(sunset);
  if (!sunriseDate || !sunsetDate) {
    return null;
  }

  const spanMs = sunsetDate.getTime() - sunriseDate.getTime();
  if (spanMs <= 0) {
    return null;
  }

  const zonedNowMs = getZonedNowMs(timeZone, nowMs);
  if (zonedNowMs === null) {
    return null;
  }

  return Math.max(0, Math.min(1, (zonedNowMs - sunriseDate.getTime()) / spanMs));
}

export function formatDaylightLengthLabel(
  sunrise,
  sunset,
  options = {}
) {
  const { fallback = null } = options;
  const sunriseDate = toValidDate(sunrise);
  const sunsetDate = toValidDate(sunset);
  if (!sunriseDate || !sunsetDate) {
    return fallback;
  }

  let diffMs = sunsetDate.getTime() - sunriseDate.getTime();
  if (diffMs <= 0) {
    diffMs += DAY_MS;
  }

  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}
