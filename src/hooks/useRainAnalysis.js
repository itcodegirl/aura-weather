import { useMemo } from "react";

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
    !Array.isArray(hourly?.precipitation_probability) ||
    !Array.isArray(hourly?.precipitation) ||
    hourly.time.length === 0
  ) {
    return getEmptyRainAnalysis();
  }

  const hourlyTimes = hourly.time;
  const hourlyProbabilities = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const hourlyAmounts = Array.isArray(hourly.precipitation) ? hourly.precipitation : [];

  const now = new Date();
  const nowMs = now.getTime();
  const startIdx = hourlyTimes.findIndex((t) => {
    const timestamp = new Date(t).getTime();
    return Number.isFinite(timestamp) && timestamp >= nowMs;
  });
  const idx = startIdx === -1 ? 0 : startIdx;

  const hours = hourlyTimes
    .slice(idx, idx + 24)
    .map((timeString, i) => {
      const timestamp = new Date(timeString);
      if (!Number.isFinite(timestamp.getTime())) return null;

      const probability = Number(hourlyProbabilities[idx + i]);
      const amount = Number(hourlyAmounts[idx + i]);

      return {
        time: timestamp,
        probability: Number.isFinite(probability) ? probability : 0,
        amount: Number.isFinite(amount) ? amount : 0,
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
      const amount = Number(hourlyAmounts[i]);
      soFarToday += Number.isFinite(amount) ? amount : 0;
    }
  }

  const peakAmount = Math.max(...hours.map((h) => h.amount));

  const sumPastHours = (hoursBack) => {
    const start = Math.max(0, idx - hoursBack);
    let sum = 0;
    for (let i = start; i < idx; i += 1) {
      const amount = Number(hourlyAmounts[i]);
      if (Number.isFinite(amount)) {
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

