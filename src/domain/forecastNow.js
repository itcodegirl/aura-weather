import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { getZonedNowMs } from "../utils/sunlight.js";
import { findWindowStartIndex } from "../utils/timeSeries.js";
import { resolveTodayIndex } from "./forecastToday.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Which entry in `weather.hourly.*` is the current hour.
 *
 * The forecast request carries `past_hours=48`, so hourly index 0 is two
 * days ago and "the current hour" has to be found, never assumed. The
 * lookup is the one HourlyCard's "Now" marker and the hero's imminent-rain
 * scan already use: reframe "now" into the location's wall clock (the
 * provider's timestamps are naive local strings, see getZonedNow) and take
 * the slot that started within the last hour.
 *
 * Returns -1 when there is no hourly series, the clock is unusable, or the
 * series does not cover now — a snapshot restored from yesterday ends
 * yesterday, and its last hour is not this one. Callers treat -1 as "the
 * current hour is unknown", not as index 0.
 */
export function resolveCurrentHourIndex(weather, nowMs) {
  const times = Array.isArray(weather?.hourly?.time) ? weather.hourly.time : [];
  if (times.length === 0) {
    return -1;
  }

  const zonedNowMs = getZonedNowMs(weather?.meta?.timezone, nowMs);
  if (zonedNowMs === null) {
    return -1;
  }

  const index = findWindowStartIndex(times, {
    now: zonedNowMs,
    currentSlotToleranceMs: HOUR_MS,
  });
  if (index < 0) {
    return -1;
  }

  // findWindowStartIndex falls back to the next slot, or to the series'
  // tail, when no slot started within the last hour. Neither is now.
  const slotMs = new Date(times[index]).getTime();
  if (!Number.isFinite(slotMs) || Math.abs(zonedNowMs - slotMs) > HOUR_MS) {
    return -1;
  }
  return index;
}

/**
 * UV the way a reader experiences it: the reading for this hour, and
 * today's peak with the hour it arrives.
 *
 * Every UV surface used to show `daily.uvIndexMax` — the day's maximum —
 * under present-tense copy ("right now", "UV very high", "sunscreen if
 * you're heading out"). At 9 am that printed the 1 pm figure as the
 * current one. The hourly `uv_index` series was fetched all along and
 * never read.
 *
 * `now` is the hourly reading at the current hour, or null when the hour
 * or the series is missing — never the peak standing in. `peak` is today's
 * daily maximum, resolved to today rather than index 0 (see
 * resolveTodayIndex). `peakTime` is the hourly slot carrying today's
 * highest hourly reading, so a tile can say "around 1 pm"; it is null when
 * the hourly series does not cover today, and with an unusable clock,
 * because "peaks at" versus "peaked at" would then be a guess. `peakIsPast`
 * says whether that hour is already behind us, or null when either side is
 * unknown.
 */
export function readUvOutlook(weather, nowMs) {
  const hourly = weather?.hourly ?? {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const series = Array.isArray(hourly.uvIndex) ? hourly.uvIndex : [];

  const todayIndex = resolveTodayIndex(weather, nowMs);
  const peak = toFiniteNumber(weather?.daily?.uvIndexMax?.[todayIndex]);

  const nowIndex = resolveCurrentHourIndex(weather, nowMs);
  const now = nowIndex >= 0 ? toFiniteNumber(series[nowIndex]) : null;

  // The peak hour is searched within today only, so a snapshot that also
  // carries yesterday cannot answer with yesterday's afternoon. "Today" is
  // the daily entry the peak value belongs to, falling back to the
  // location's calendar date when the daily series has no dates.
  const dailyDate = weather?.daily?.time?.[todayIndex];
  const referenceTime = toFiniteNumber(nowMs);
  let todayIso = null;
  if (referenceTime !== null) {
    todayIso =
      typeof dailyDate === "string" && dailyDate.trim()
        ? dailyDate.trim().slice(0, 10)
        : getIsoDateInTimeZone(weather?.meta?.timezone, new Date(referenceTime));
  }

  let peakIndex = -1;
  let peakValue = -Infinity;
  if (todayIso !== null) {
    for (let i = 0; i < times.length; i += 1) {
      const time = times[i];
      if (typeof time !== "string" || time.slice(0, 10) !== todayIso) {
        continue;
      }
      const value = toFiniteNumber(series[i]);
      if (value !== null && value > peakValue) {
        peakValue = value;
        peakIndex = i;
      }
    }
  }

  return {
    now,
    peak,
    peakTime: peakIndex >= 0 ? times[peakIndex] : null,
    peakIsPast: peakIndex >= 0 && nowIndex >= 0 ? peakIndex < nowIndex : null,
  };
}
