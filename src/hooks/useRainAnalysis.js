import { useMemo } from "react";
import { resolveWindowStart } from "../utils/timeSeries.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toEpochMs, zonedWallClockToEpoch } from "../utils/zonedTime.js";

/*
 * Hours of rain this analysis looks ahead. Declared once: it used to be the
 * literal 24 in two places — the window passed to the series helper and the
 * slice that actually applied it — which is a fact declared twice by hand.
 * `forecastWindow.test.mjs` reads this constant to check the forecast request
 * asks for enough hours to fill it after a replayed snapshot.
 */
const RAIN_WINDOW_HOURS = 24;

function getEmptyRainAnalysis() {
  return {
    hasData: false,
    hours: [],
    nextRain: null,
    peak: null,
    total: null,
    soFarToday: null,
    peakAmount: null,
    past12h: null,
    past24h: null,
    past48h: null,
    pastWindowCoverage: { h12: 0, h24: 0, h48: 0 },
    missingSlots: 0,
  };
}

function sumFiniteValues(values) {
  let total = 0;
  let count = 0;

  for (const value of values) {
    const numeric = toFiniteNumber(value);
    if (numeric === null) {
      continue;
    }
    total += Math.max(numeric, 0);
    count += 1;
  }

  return count === 0 ? null : total;
}

export function analyzeRain(hourly, timeZone, now = Date.now()) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly?.rainChance) ||
    !Array.isArray(hourly?.rainAmount) ||
    hourly.time.length === 0
  ) {
    return getEmptyRainAnalysis();
  }

  const hourlyTimes = hourly.time;
  const hourlyProbabilities = Array.isArray(hourly.rainChance)
    ? hourly.rainChance
    : [];
  const hourlyAmounts = Array.isArray(hourly.rainAmount) ? hourly.rainAmount : [];

  // Open-Meteo timestamps are the location's naive wall clock
  // (timezone=auto). The zone goes to resolveWindowStart, which resolves
  // them to real instants, so `now` is the real clock.
  //
  // A `stale` series — every slot behind now, i.e. a replayed snapshot whose
  // window has closed — yields -1 and takes the empty branch. It used to
  // resolve to the series' tail and be analysed as though it were the next
  // 24 hours.
  const { index: idx } = resolveWindowStart(hourlyTimes, {
    now,
    timeZone,
  });
  if (idx < 0) {
    return getEmptyRainAnalysis();
  }

  const hours = hourlyTimes
    .slice(idx, idx + RAIN_WINDOW_HOURS)
    .map((timeString, i) => {
      const timestamp = new Date(timeString);
      if (!Number.isFinite(timestamp.getTime())) return null;

      const probability = toFiniteNumber(hourlyProbabilities[idx + i]);
      const amount = toFiniteNumber(hourlyAmounts[idx + i]);

      return {
        time: timestamp,
        probability,
        amount,
        missing: probability === null && amount === null,
      };
    })
    .filter(Boolean)
    .filter((entry) => Number.isFinite(entry.time.getTime()));

  if (!hours.length) {
    return { ...getEmptyRainAnalysis(), hours };
  }

  const probabilityHours = hours.filter((hour) => hour.probability !== null);
  const amountHours = hours.filter((hour) => hour.amount !== null);
  const hasData = probabilityHours.length > 0 || amountHours.length > 0;
  const missingSlots = hours.filter((hour) => hour.missing).length;

  if (!hasData) {
    return {
      ...getEmptyRainAnalysis(),
      hours,
      missingSlots,
    };
  }

  const nextRain = hours.find(
    (h) =>
      (h.probability !== null && h.probability >= 40) ||
      (h.amount !== null && h.amount > 0.01)
  );
  const peakProbabilityHour = probabilityHours.reduce(
    (max, h) => (h.probability > max.probability ? h : max),
    probabilityHours[0] ?? null
  );
  const peakAmountHour = amountHours.reduce(
    (max, h) => (h.amount > max.amount ? h : max),
    amountHours[0] ?? null
  );
  const peak = peakProbabilityHour ?? peakAmountHour;
  const total = amountHours.length
    ? amountHours.reduce((sum, h) => sum + Math.max(h.amount, 0), 0)
    : null;

  // The location's midnight as a real instant: its calendar day, then that
  // day's 00:00 resolved through its own zone. On a spring-forward morning
  // the location's day starts at 00:00 as usual but is 23 hours long, which
  // a device-local `setHours(0,0,0,0)` could not express.
  const todayIso = getIsoDateInTimeZone(timeZone, new Date(now));
  const todayMs = zonedWallClockToEpoch(`${todayIso}T00:00`, timeZone);
  const todayStartIdx =
    todayMs === null
      ? -1
      : hourly.time.findIndex((t) => {
          const timestamp = toEpochMs(t, timeZone);
          return timestamp !== null && timestamp >= todayMs;
        });
  let soFarToday = null;
  if (todayStartIdx !== -1) {
    soFarToday = sumFiniteValues(hourlyAmounts.slice(todayStartIdx, idx));
  }

  const peakAmount = amountHours.length
    ? Math.max(...amountHours.map((h) => h.amount))
    : null;

  const sumPastHours = (hoursBack) => {
    const start = Math.max(0, idx - hoursBack);
    return sumFiniteValues(hourlyAmounts.slice(start, idx));
  };

  const past12h = sumPastHours(12);
  const past24h = sumPastHours(24);
  const past48h = sumPastHours(48);

  // Past slots the series can actually serve per look-back window. The
  // sums above clamp at index 0, so a series with less history than a
  // window requests (e.g. 48h backed by 36 slots) would otherwise let two
  // window totals silently match; consumers need the real span to label it.
  const coveredPastHours = (hoursBack) => Math.min(hoursBack, idx);
  const pastWindowCoverage = {
    h12: coveredPastHours(12),
    h24: coveredPastHours(24),
    h48: coveredPastHours(48),
  };

  return {
    hasData,
    hours,
    nextRain,
    peak,
    total,
    soFarToday,
    peakAmount,
    past12h,
    past24h,
    past48h,
    pastWindowCoverage,
    missingSlots,
  };
}

export function useRainAnalysis(hourly, timeZone) {
  return useMemo(() => analyzeRain(hourly, timeZone), [hourly, timeZone]);
}
