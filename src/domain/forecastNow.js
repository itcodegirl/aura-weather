import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { resolveWindowStart } from "../utils/timeSeries.js";
import { toEpochMs } from "../utils/zonedTime.js";
import { resolveTodayIndex } from "./forecastToday.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Which entry in `weather.hourly.*` is the current hour.
 *
 * The forecast request carries `past_hours=48`, so hourly index 0 is two
 * days ago and "the current hour" has to be found, never assumed. The
 * lookup is the one HourlyCard's "Now" marker and the hero's imminent-rain
 * scan already use: resolve the provider's naive local strings into real
 * instants through the location's zone (see `utils/zonedTime.js`) and take
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

  const timeZone = weather?.meta?.timezone;
  const referenceNow = toFiniteNumber(nowMs);
  if (referenceNow === null) {
    return -1;
  }

  const { index } = resolveWindowStart(times, {
    now: referenceNow,
    currentSlotToleranceMs: HOUR_MS,
    timeZone,
  });
  if (index < 0) {
    return -1;
  }

  // resolveWindowStart falls back to the next slot when no slot started
  // within the last hour, and that slot is not now either. (It no longer
  // falls back to the series' tail — a run-out series reports `stale` and
  // is rejected above — but a forward slot an hour ahead still is not now.)
  const slotMs = toEpochMs(times[index], timeZone);
  if (slotMs === null || Math.abs(referenceNow - slotMs) > HOUR_MS) {
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
/*
 * Today's calendar date as "YYYY-MM-DD", for matching hourly slots (whose
 * naive strings start with the location-local date) to today. It is the
 * daily entry that `todayIndex` points at, so a peak or a total is matched
 * to the day its daily figure describes, falling back to the location's
 * calendar date when the daily series carries no dates. Null without a
 * usable clock: "today" is then not knowable, and nothing below should
 * pretend otherwise.
 */
function resolveTodayIso(weather, todayIndex, nowMs) {
  const referenceTime = toFiniteNumber(nowMs);
  if (referenceTime === null) {
    return null;
  }
  const dailyDate = weather?.daily?.time?.[todayIndex];
  return typeof dailyDate === "string" && dailyDate.trim()
    ? dailyDate.trim().slice(0, 10)
    : getIsoDateInTimeZone(weather?.meta?.timezone, new Date(referenceTime));
}

export function readUvOutlook(weather, nowMs) {
  const hourly = weather?.hourly ?? {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const series = Array.isArray(hourly.uvIndex) ? hourly.uvIndex : [];

  // A run-out daily series has no "today" to report a peak for. Null rather
  // than an object of nulls: every consumer reaches straight for a field, so
  // an unconverted one throws on the first read instead of quietly rendering
  // the stale day's peak as today's.
  const { index: todayIndex, status } = resolveTodayIndex(weather, nowMs);
  if (status === "stale") {
    return null;
  }
  const peak = toFiniteNumber(weather?.daily?.uvIndexMax?.[todayIndex]);

  const nowIndex = resolveCurrentHourIndex(weather, nowMs);
  const now = nowIndex >= 0 ? toFiniteNumber(series[nowIndex]) : null;

  // The peak hour is searched within today only, so a snapshot that also
  // carries yesterday cannot answer with yesterday's afternoon.
  const todayIso = resolveTodayIso(weather, todayIndex, nowMs);

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

/**
 * Rain the way the rest of today looks from this hour.
 *
 * The hero's rain guidance read `daily.rainChanceMax` and
 * `daily.rainAmountTotal`: the whole calendar day, hours already gone
 * included. At 9 pm after a rainy morning it still said "Bring rain gear —
 * 80% peak chance today" over a dry evening. This reads the hourly series
 * from the current slot to the end of today instead: `chance` is the
 * highest hourly probability among those hours, `amount` their total.
 *
 * A maximum survives gaps — a missing slot cannot lower it — so `chance` is
 * null only when every remaining hour is missing. A total does not: with
 * any remaining amount missing, `amount` is null rather than an undercount
 * presented as the expected rain.
 *
 * `source` says where the figures came from. "hourly" is the rest of today.
 * "daily" is the calendar-day fallback, used when the hourly series is
 * absent, does not cover now (a snapshot restored from yesterday), or
 * carries no rain fields; guidance built on it should say "today", not
 * "the rest of today". null means neither series had a figure.
 */
export function readRainOutlook(weather, nowMs) {
  const hourly = weather?.hourly ?? {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const chances = Array.isArray(hourly.rainChance) ? hourly.rainChance : [];
  const amounts = Array.isArray(hourly.rainAmount) ? hourly.rainAmount : [];

  // Same run-out rule as readUvOutlook: no today, no "rest of today".
  const { index: todayIndex, status } = resolveTodayIndex(weather, nowMs);
  if (status === "stale") {
    return null;
  }
  const nowIndex = resolveCurrentHourIndex(weather, nowMs);
  const todayIso = resolveTodayIso(weather, todayIndex, nowMs);

  if (nowIndex >= 0 && todayIso !== null) {
    let chance = null;
    let amount = 0;
    let amountKnown = true;
    let hoursRemaining = 0;
    for (let i = nowIndex; i < times.length; i += 1) {
      const time = times[i];
      if (typeof time !== "string" || time.slice(0, 10) !== todayIso) {
        continue;
      }
      hoursRemaining += 1;
      const hourChance = toFiniteNumber(chances[i]);
      if (hourChance !== null && (chance === null || hourChance > chance)) {
        chance = hourChance;
      }
      const hourAmount = toFiniteNumber(amounts[i]);
      if (hourAmount === null) {
        amountKnown = false;
      } else {
        amount += hourAmount;
      }
    }
    const knownAmount = amountKnown && hoursRemaining > 0 ? amount : null;
    if (chance !== null || knownAmount !== null) {
      return { source: "hourly", chance, amount: knownAmount, hoursRemaining };
    }
  }

  const chance = toFiniteNumber(weather?.daily?.rainChanceMax?.[todayIndex]);
  const amount = toFiniteNumber(weather?.daily?.rainAmountTotal?.[todayIndex]);
  return {
    source: chance === null && amount === null ? null : "daily",
    chance,
    amount,
    hoursRemaining: null,
  };
}
