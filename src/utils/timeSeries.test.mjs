import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findWindowStartIndex } from "./timeSeries.js";

describe("time series helpers", () => {
  test("returns first future index when a future timestamp exists", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const series = [
      "2026-04-21T10:00:00Z",
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
    ];

    const startIndex = findWindowStartIndex(series, { now, windowSize: 3 });
    assert.equal(startIndex, 2);
  });

  test("uses trailing window when all timestamps are in the past", () => {
    const now = Date.parse("2026-04-21T20:00:00Z");
    const series = [
      "2026-04-21T10:00:00Z",
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
      "2026-04-21T14:00:00Z",
    ];

    const startIndex = findWindowStartIndex(series, { now, windowSize: 2 });
    assert.equal(startIndex, 3);
  });

  test("returns -1 when no valid timestamps are available", () => {
    const startIndex = findWindowStartIndex(["bad", "", null], {
      now: Date.parse("2026-04-21T12:00:00Z"),
      windowSize: 4,
    });
    assert.equal(startIndex, -1);
  });

  test("snaps to the active hour slot when within tolerance", () => {
    const now = Date.parse("2026-04-21T12:30:00Z");
    const series = [
      "2026-04-21T10:00:00Z",
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
      "2026-04-21T14:00:00Z",
    ];

    const startIndex = findWindowStartIndex(series, {
      now,
      windowSize: 24,
      currentSlotToleranceMs: 60 * 60 * 1000,
    });
    assert.equal(startIndex, 2);
  });

  test("falls back to Date.now() when an explicit null `now` is passed", () => {
    // Guard against the same Number(null) === 0 trap that surfaced
    // elsewhere in the audit. With null `now`, the helper would
    // otherwise treat the Unix epoch as "now" and skip every entry
    // because every test timestamp is in the future.
    const futureSeries = [
      "3000-01-01T00:00:00Z",
      "3000-01-01T01:00:00Z",
    ];

    const startIndex = findWindowStartIndex(futureSeries, {
      now: null,
      windowSize: 24,
    });
    // First future entry relative to a real Date.now() is index 0.
    assert.equal(startIndex, 0);
  });

  test("falls back to first future when tolerance is too small", () => {
    const now = Date.parse("2026-04-21T12:30:00Z");
    const series = [
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
    ];

    const startIndex = findWindowStartIndex(series, {
      now,
      windowSize: 24,
      currentSlotToleranceMs: 5 * 60 * 1000,
    });
    assert.equal(startIndex, 2);
  });
});
