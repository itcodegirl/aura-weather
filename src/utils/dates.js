// src/utils/dates.js

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

/**
 * Formats a date string (ISO) as a human-readable day label.
 * Returns "Today", "Tomorrow", or abbreviated weekday name.
 */
export function formatDayLabel(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((compareDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";

  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Short date like "Apr 18"
 */
export function formatShortDate(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) {
    return "\u2014";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a Date as a short hour label like "3 PM" or "11 AM".
 */
export function formatHour(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}
