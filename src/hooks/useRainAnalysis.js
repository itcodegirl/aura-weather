import { useMemo } from "react";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/numbers";

function getEmptyRainAnalysis() {
  return {
    hours: [],
    nextRain: null,
    peak: { probability: 0, time: new Date(), amount: 0 },
    total: 0,
    soFarToday: 0,
    peakAmount: 0,
    past12h: 0,
    past24h: 0,
    past48h: 0,
  };
}

function analyzeRain(hourly) {
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

  const idx = findWindowStartIndex(hourlyTimes, { windowSize: 24 });
  if (idx < 0) {
    return getEmptyRainAnalysis();
  }

  const hours = hourlyTimes
    .slice(idx, idx + 24)
    .map((timeString, i) => {
      const timestamp = new Date(timeString);
      if (!Number.isFinite(timestamp.getTime())) return null;

      // Missing precipitation readings should mean "no rain detected"
      // (0% / 0 inches), so coerce nullish values explicitly to 0.
      const probability = toFiniteNumber(hourlyProbabilities[idx + i]) ?? 0;
      const amount = toFiniteNumber(hourlyAmounts[idx + i]) ?? 0;

      return {
        time: timestamp,
        probability,
        amount,
      };
    })
    .filter(Boolean)
    .filter((entry) => Number.isFinite(entry.time.getTime()));

  if (!hours.length) {
    return { ...getEmptyRainAnalysis(), hours };
  }

  const nextRain = hours.find((h) => h.probability >= 40);
  const peak = hours.reduce(
    (max, h) => (h.probability > max.probability ? h : max),
    hours[0]
  );
  const total = hours.reduce((sum, h) => sum + h.amount, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const todayStartIdx = hourly.time.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= todayMs;
  });
  let soFarToday = 0;
  if (todayStartIdx !== -1) {
    for (let i = todayStartIdx; i < idx; i += 1) {
      soFarToday += toFiniteNumber(hourlyAmounts[i]) ?? 0;
    }
  }

  const peakAmount = Math.max(...hours.map((h) => h.amount));

  const sumPastHours = (hoursBack) => {
    const start = Math.max(0, idx - hoursBack);
    let sum = 0;
    for (let i = start; i < idx; i += 1) {
      const amount = toFiniteNumber(hourlyAmounts[i]);
      if (amount !== null) {
        sum += amount;
      }
    }
    return sum;
  };

  const past12h = sumPastHours(12);
  const past24h = sumPastHours(24);
  const past48h = sumPastHours(48);

  return {
    hours,
    nextRain,
    peak,
    total,
    soFarToday,
    peakAmount,
    past12h,
    past24h,
    past48h,
  };
}

export function useRainAnalysis(hourly) {
  return useMemo(() => analyzeRain(hourly), [hourly]);
}
