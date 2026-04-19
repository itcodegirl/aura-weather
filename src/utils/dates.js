// src/utils/dates.js

/**
 * Formats a date string (ISO) as a human-readable day label.
 * Returns "Today", "Tomorrow", or abbreviated weekday name.
 */
export function formatDayLabel(isoDate) {
  const date = new Date(isoDate);
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
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}