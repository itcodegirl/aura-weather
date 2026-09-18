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
      resolveTodayIndex(build(["2026-08-31", "2026-09-01", "2026-09-02"]), NOW)
        .index,
      1
    );
  });

  test("skips however many stale days a snapshot carries", () => {
    assert.equal(
      resolveTodayIndex(
        build(["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"]),
        NOW
      ).index,
      3
    );
  });

  test("is index 0 on a fresh fetch", () => {
    assert.equal(
      resolveTodayIndex(build(["2026-09-01", "2026-09-02"]), NOW).index,
      0
    );
  });

  test("falls back to 0 when every day is in the past, and says it is stale", () => {
    // The index still matches ForecastCard, which renders every valid day when
    // none are upcoming, so both panels show the same day rather than
    // disagreeing in the other direction. What is new is that callers can now
    // tell this apart from a hit — 0 is a real, in-range index, and for six
    // call sites it was indistinguishable from today.
    const runOut = resolveTodayIndex(build(["2026-08-28", "2026-08-29"]), NOW);
    assert.equal(runOut.index, 0);
    assert.equal(runOut.status, "stale");
    // Measured from the START of the last day the series carries.
    assert.equal(runOut.staleByMs, NOW - Date.parse("2026-08-29T00:00:00Z"));
  });

  test("an upcoming day is ok, with no staleness to report", () => {
    const fresh = resolveTodayIndex(build(["2026-09-01", "2026-09-02"]), NOW);
    assert.equal(fresh.status, "ok");
    assert.equal(fresh.staleByMs, null);
  });

  test("an unplaceable clock is unknown, never stale", () => {
    // HeroCard passes nowMs: null until useTimeNow resolves, which is a real
    // first-paint state. Calling that "stale" would blank the hero on every
    // first paint — a different failure, not a fix.
    for (const clock of [null, Number.NaN, "18:00"]) {
      const result = resolveTodayIndex(build(["2026-08-28"]), clock);
      assert.equal(result.status, "unknown", `clock ${String(clock)}`);
      assert.equal(result.index, 0);
      assert.equal(result.staleByMs, null);
    }
  });

  test("a missing daily series is unknown, never stale", () => {
    // Nothing to be stale ABOUT. Callers already render "—" from the
    // undefined lookup this index produces.
    for (const weather of [build([]), null, { daily: {} }, build([null, ""])]) {
      const result = resolveTodayIndex(weather, NOW);
      assert.equal(result.status, "unknown");
      assert.equal(result.index, 0);
    }
  });

  test("the run-out bound is the series' own cadence, not a snapshot age", () => {
    // Yesterday-only is already run out: there is no entry at or after today,
    // whatever the fetch age. Deliberately not tied to
    // DEGRADED_SNAPSHOT_MAX_AGE_MS — how old the fetch is and whether the days
    // inside it have run out are different questions.
    const yesterday = resolveTodayIndex(build(["2026-08-31"]), NOW);
    assert.equal(yesterday.status, "stale");
    assert.ok(yesterday.staleByMs > 0 && yesterday.staleByMs < 2 * 24 * 60 * 60 * 1000);
  });

  test("resolves today in the location's zone, not the viewer's", () => {
    // 2026-09-01T12:00Z is already 2026-09-01 in Tokyo (+09) and still
    // 2026-09-01 in UTC, so pick an hour where the two calendars disagree:
    // 2026-09-01T20:00Z is 2026-09-02 in Tokyo.
    const acrossMidnight = Date.parse("2026-09-01T20:00:00Z");
    const times = ["2026-09-01", "2026-09-02"];
    assert.equal(
      resolveTodayIndex(build(times, "UTC"), acrossMidnight).index,
      0
    );
    assert.equal(
      resolveTodayIndex(build(times, "Asia/Tokyo"), acrossMidnight).index,
      1,
      "Tokyo has already rolled over to the 2nd"
    );
  });

  test("falls back to 0 rather than guessing on unusable input", () => {
    // nowMs is passed explicitly because this runs inside a useMemo factory,
    // where reading the clock would violate react-hooks/purity. An unusable
    // one must not fabricate a day.
    assert.equal(
      resolveTodayIndex(build(["2026-08-31", "2026-09-01"]), NaN).index,
      0
    );
    assert.equal(resolveTodayIndex(build(["2026-08-31"]), null).index, 0);
    assert.equal(resolveTodayIndex(build([]), NOW).index, 0);
    assert.equal(resolveTodayIndex(null, NOW).index, 0);
    assert.equal(resolveTodayIndex({ daily: {} }, NOW).index, 0);
  });

  test("ignores non-string entries instead of throwing", () => {
    assert.equal(
      resolveTodayIndex(build([null, 42, "2026-09-01"]), NOW).index,
      2
    );
  });
});
