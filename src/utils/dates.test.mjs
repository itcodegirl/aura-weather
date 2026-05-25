import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDayLabel,
  formatShortDate,
  parseLocalDate,
  formatHour,
  getZonedNow,
} from "./dates.js";

function isoDateInZone(timeZone, when = new Date()) {
  // en-CA renders YYYY-MM-DD, which parseLocalDate accepts.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

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

  test("getZonedNow returns the device clock when no timeZone is given", () => {
    const now = Date.UTC(2026, 3, 21, 23, 0, 0);
    const zoned = getZonedNow(undefined, now);
    assert.equal(zoned.getTime(), now);
  });

  test("getZonedNow falls back to the device clock for an unknown zone", () => {
    const now = Date.UTC(2026, 3, 21, 23, 0, 0);
    const zoned = getZonedNow("Not/AZone", now);
    assert.equal(zoned.getTime(), now);
  });

  test("getZonedNow reframes the instant into the target zone's wall clock", () => {
    // 2026-04-21 23:00 UTC is 08:00 on the 22nd in Tokyo (UTC+9) and
    // 18:00 on the 21st in Chicago (UTC-5). The returned Date carries
    // those wall-clock parts as device-local components, matching how
    // Open-Meteo's naive timestamps parse \u2014 so getHours/getDate are
    // assertable regardless of the test machine's own zone.
    const now = Date.UTC(2026, 3, 21, 23, 0, 0);

    const tokyo = getZonedNow("Asia/Tokyo", now);
    assert.equal(tokyo.getHours(), 8);
    assert.equal(tokyo.getDate(), 22);

    const chicago = getZonedNow("America/Chicago", now);
    assert.equal(chicago.getHours(), 18);
    assert.equal(chicago.getDate(), 21);
  });

  test("formatDayLabel anchors Today/Tomorrow to the supplied timeZone", () => {
    // Use each zone's actual current calendar day so the assertion holds
    // no matter which zone the test runner is in.
    const tokyoToday = isoDateInZone("Asia/Tokyo");
    assert.equal(formatDayLabel(tokyoToday, { timeZone: "Asia/Tokyo" }), "Today");

    const chicagoToday = isoDateInZone("America/Chicago");
    assert.equal(
      formatDayLabel(chicagoToday, { timeZone: "America/Chicago" }),
      "Today"
    );
  });
});
