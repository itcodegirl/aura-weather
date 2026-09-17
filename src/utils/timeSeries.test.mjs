import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveWindowStart } from "./timeSeries.js";

/*
 * These cases are the old `findWindowStartIndex` suite, carried over with the
 * new return shape — plus the case it was missing.
 *
 * Worth noting what the old suite did: it asserted the trailing-window clamp
 * as correct behaviour ("uses trailing window when all timestamps are in the
 * past", expecting index 3). The helper passed its own tests while producing
 * "Heavy rain likely now" from a two-day-old series, because the tests were
 * written from the helper's point of view and the damage was three layers up.
 * That case is inverted below, and `staleWindow.test.mjs` drives the callers.
 */

const HOUR_MS = 60 * 60 * 1000;

describe("resolveWindowStart", () => {
  test("returns the first future index when a future timestamp exists", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const series = [
      "2026-04-21T10:00:00Z",
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
    ];

    assert.deepEqual(resolveWindowStart(series, { now }), {
      index: 2,
      status: "ok",
      staleByMs: null,
    });
  });

  test("reports `stale` when every timestamp is in the past", () => {
    // This is the case the old helper answered with index 3 — the start of
    // its trailing window, a real index its callers read as "now".
    const now = Date.parse("2026-04-21T20:00:00Z");
    const series = [
      "2026-04-21T10:00:00Z",
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
      "2026-04-21T14:00:00Z",
    ];

    const result = resolveWindowStart(series, { now });
    assert.equal(result.status, "stale");
    assert.equal(result.index, -1, "a stale series must not yield a usable index");
    // Six hours between the last slot (14:00) and now (20:00).
    assert.equal(result.staleByMs, 6 * HOUR_MS);
  });

  test("`stale` survives a guard written for the old contract", () => {
    // Every caller guards with `if (index < 0)`. The point of returning -1
    // rather than the tail is that those guards fire unchanged.
    const now = Date.parse("2026-04-21T20:00:00Z");
    const { index } = resolveWindowStart(["2026-04-21T10:00:00Z"], { now });
    assert.ok(index < 0);
  });

  test("reports `empty` when no valid timestamps are available", () => {
    const result = resolveWindowStart(["bad", "", null], {
      now: Date.parse("2026-04-21T12:00:00Z"),
    });
    assert.equal(result.status, "empty");
    assert.equal(result.index, -1);
    assert.equal(result.staleByMs, null);
  });

  test("reports `empty` for a missing or non-array series", () => {
    for (const input of [[], null, undefined, "nope", 42]) {
      assert.equal(resolveWindowStart(input, { now: Date.now() }).status, "empty");
    }
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

    const result = resolveWindowStart(series, {
      now,
      currentSlotToleranceMs: HOUR_MS,
    });
    assert.equal(result.index, 2);
    assert.equal(result.status, "ok");
  });

  test("falls back to Date.now() when an explicit null `now` is passed", () => {
    // Guard against the same Number(null) === 0 trap that surfaced elsewhere
    // in the audit. With null `now`, the helper would otherwise treat the
    // Unix epoch as "now" and skip every entry because every test timestamp
    // is in the future.
    const futureSeries = ["3000-01-01T00:00:00Z", "3000-01-01T01:00:00Z"];

    const result = resolveWindowStart(futureSeries, { now: null });
    assert.equal(result.index, 0);
    assert.equal(result.status, "ok");
  });

  test("falls back to the first future slot when tolerance is too small", () => {
    const now = Date.parse("2026-04-21T12:30:00Z");
    const series = [
      "2026-04-21T11:00:00Z",
      "2026-04-21T12:00:00Z",
      "2026-04-21T13:00:00Z",
    ];

    const result = resolveWindowStart(series, {
      now,
      currentSlotToleranceMs: 5 * 60 * 1000,
    });
    assert.equal(result.index, 2);
    assert.equal(result.status, "ok");
  });

  test("a tolerance that reaches back past a run-out series does not rescue it", () => {
    // The tolerance branch only ever matches a slot at or before now AND
    // within tolerance. A generous tolerance must not turn a two-day-old
    // series back into a hit.
    const now = Date.parse("2026-04-21T20:00:00Z");
    const result = resolveWindowStart(["2026-04-19T20:00:00Z"], {
      now,
      currentSlotToleranceMs: HOUR_MS,
    });
    assert.equal(result.status, "stale");
  });

  test("unusable entries are skipped without shifting the reported index", () => {
    // The index is into the ORIGINAL array, not into the filtered one — a
    // caller reads `series[index]`, gaps and all.
    const now = Date.parse("2026-04-21T12:00:00Z");
    const series = [null, "2026-04-21T11:00:00Z", "bad", "2026-04-21T13:00:00Z"];
    assert.equal(resolveWindowStart(series, { now }).index, 3);
  });

  test("staleByMs is null whenever there is a usable index", () => {
    const now = Date.parse("2026-04-21T12:00:00Z");
    const result = resolveWindowStart(["2026-04-21T13:00:00Z"], { now });
    assert.equal(result.staleByMs, null);
  });
});
