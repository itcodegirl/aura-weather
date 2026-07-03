import { useMemo } from "react";
import { findWindowStartIndex } from "../utils/timeSeries.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { getZonedNow } from "../utils/dates.js";

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

  // Reframe "now" into the location's timezone. Open-Meteo timestamps are
  // naive location wall-clock (timezone=auto), parsed as device-local; the
  // real clock must be reframed the same way or the window start and day
  // boundary drift by the device/location offset for a remote city.
  const zonedNow = getZonedNow(timeZone, now);
  const idx = findWindowStartIndex(hourlyTimes, {
    windowSize: 24,
    now: zonedNow.getTime(),
  });
  if (idx < 0) {
    return getEmptyRainAnalysis();
  }

  const hours = hourlyTimes
    .slice(idx, idx + 24)
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

  // Location's midnight, in the same device-local frame the forecast
  // timestamps are parsed in — not the device's midnight.
  const today = new Date(zonedNow);
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const todayStartIdx = hourly.time.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= todayMs;
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
    missingSlots,
  };
}

export function useRainAnalysis(hourly, timeZone) {
  return useMemo(() => analyzeRain(hourly, timeZone), [hourly, timeZone]);
}
