import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDayLabel,
  formatShortDate,
  getIsoDateInTimeZone,
  parseLocalDate,
  formatHour,
} from "./dates.js";

function toIsoLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("dates utils", () => {
  test("parseLocalDate parses valid ISO date at local midnight", () => {
    const parsed = parseLocalDate("2026-04-20");
    assert.ok(parsed instanceof Date);
    assert.equal(parsed.getHours(), 0);
    assert.equal(parsed.getMinutes(), 0);
  });

  test("parseLocalDate returns null for invalid input", () => {
    assert.equal(parseLocalDate(""), null);
    assert.equal(parseLocalDate("2026/04/20"), null);
    assert.equal(parseLocalDate("not-a-date"), null);
  });

  test("formatDayLabel returns Today and Tomorrow where expected", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    assert.equal(formatDayLabel(toIsoLocalDate(today)), "Today");
    assert.equal(formatDayLabel(toIsoLocalDate(tomorrow)), "Tomorrow");
  });

  test("getIsoDateInTimeZone resolves the calendar date in the requested timezone", () => {
    // 2026-04-21T03:00Z is still April 20 in Chicago (UTC-5) but
    // already April 21 in Tokyo (UTC+9).
    const now = new Date("2026-04-21T03:00:00Z");
    assert.equal(getIsoDateInTimeZone("America/Chicago", now), "2026-04-20");
    assert.equal(getIsoDateInTimeZone("Asia/Tokyo", now), "2026-04-21");
  });

  test("getIsoDateInTimeZone falls back to the local date for missing or invalid timezones", () => {
    const now = new Date("2026-04-21T12:00:00");
    assert.equal(getIsoDateInTimeZone(undefined, now), toIsoLocalDate(now));
    assert.equal(getIsoDateInTimeZone("Not/AZone", now), toIsoLocalDate(now));
    assert.equal(getIsoDateInTimeZone("   ", now), toIsoLocalDate(now));
  });

  test("formatDayLabel resolves Today/Tomorrow in the location's timezone, not the viewer's", () => {
    // At 03:00 UTC the viewer may already be on April 21, but Honolulu
    // (UTC-10) is still on April 20 — its forecast for "2026-04-20"
    // must read "Today", and "2026-04-21" must read "Tomorrow".
    const now = new Date("2026-04-21T03:00:00Z");
    assert.equal(
      formatDayLabel("2026-04-20", { timeZone: "Pacific/Honolulu", now }),
      "Today"
    );
    assert.equal(
      formatDayLabel("2026-04-21", { timeZone: "Pacific/Honolulu", now }),
      "Tomorrow"
    );
    // Tokyo is already a day ahead at the same instant.
    assert.equal(
      formatDayLabel("2026-04-21", { timeZone: "Asia/Tokyo", now }),
      "Today"
    );
  });

  test("formatDayLabel and formatShortDate return fallback for invalid values", () => {
    assert.equal(formatDayLabel("bad-input"), "\u2014");
    assert.equal(formatShortDate("bad-input"), "\u2014");
  });

  test("formatShortDate matches locale short month/day output", () => {
    const target = new Date();
    target.setDate(target.getDate() + 3);
    target.setHours(0, 0, 0, 0);
    const iso = toIsoLocalDate(target);

    const expected = target.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    assert.equal(formatShortDate(iso), expected);
  });

  test("formatHour renders a Date into a locale hour label", () => {
    const target = new Date("2026-04-20T15:00:00");
    const expected = target.toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
    });

    assert.equal(formatHour(target), expected);
  });

  test("formatHour returns fallback for invalid input", () => {
    assert.equal(formatHour("not-a-date"), "\u2014");
  });
});
