import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveTodayIndex } from "./forecastToday.js";

const NOW = Date.parse("2026-09-01T12:00:00Z");

function build(times, timezone = "UTC") {
  return { meta: { timezone }, daily: { time: times } };
}

describe("resolveTodayIndex", () => {
  test("picks today, not index 0, in a snapshot restored from yesterday", () => {
    // The defect this exists to fix. A cache captured yesterday still carries
    // yesterday at index 0, and the hero read that index unconditionally while
    // ForecastCard filtered its rows to date >= today.
    assert.equal(
      resolveTodayIndex(build(["2026-08-31", "2026-09-01", "2026-09-02"]), NOW),
      1
    );
  });

  test("skips however many stale days a snapshot carries", () => {
    assert.equal(
      resolveTodayIndex(
        build(["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]),
        NOW
      ),
      3
    );
  });

  test("is index 0 on a fresh fetch", () => {
    assert.equal(
      resolveTodayIndex(build(["2026-09-01", "2026-09-02"]), NOW),
      0
    );
  });

  test("falls back to 0 when every day is in the past", () => {
    // Matches ForecastCard, which renders every valid day when none are
    // upcoming. Both panels then show the same stale day rather than
    // disagreeing in the other direction.
    assert.equal(
      resolveTodayIndex(build(["2026-08-28", "2026-08-29"]), NOW),
      0
    );
  });

  test("resolves today in the location's zone, not the viewer's", () => {
    // 2026-09-01T12:00Z is already 2026-09-01 in Tokyo (+09) and still
    // 2026-09-01 in UTC, so pick an hour where the two calendars disagree:
    // 2026-09-01T20:00Z is 2026-09-02 in Tokyo.
    const acrossMidnight = Date.parse("2026-09-01T20:00:00Z");
    const times = ["2026-09-01", "2026-09-02"];
    assert.equal(resolveTodayIndex(build(times, "UTC"), acrossMidnight), 0);
    assert.equal(
      resolveTodayIndex(build(times, "Asia/Tokyo"), acrossMidnight),
      1,
      "Tokyo has already rolled over to the 2nd"
    );
  });

  test("falls back to 0 rather than guessing on unusable input", () => {
    // nowMs is passed explicitly because this runs inside a useMemo factory,
    // where reading the clock would violate react-hooks/purity. An unusable
    // one must not fabricate a day.
    assert.equal(resolveTodayIndex(build(["2026-08-31", "2026-09-01"]), NaN), 0);
    assert.equal(resolveTodayIndex(build(["2026-08-31"]), null), 0);
    assert.equal(resolveTodayIndex(build([]), NOW), 0);
    assert.equal(resolveTodayIndex(null, NOW), 0);
    assert.equal(resolveTodayIndex({ daily: {} }, NOW), 0);
  });

  test("ignores non-string entries instead of throwing", () => {
    assert.equal(
      resolveTodayIndex(build([null, 42, "2026-09-01"]), NOW),
      2
    );
  });
});
