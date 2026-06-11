import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_REFRESH_MIN_INTERVAL_MS,
  AUTO_REFRESH_STALE_AFTER_MS,
  shouldAutoRefreshWeather,
} from "./weatherRefreshPolicy.js";

const NOW = 1_700_000_000_000;

function decide(overrides = {}) {
  return shouldAutoRefreshWeather({
    nowMs: NOW,
    weatherFetchedAt: NOW - 5 * 60 * 1000,
    forecastStatus: "ready",
    ...overrides,
  });
}

describe("shouldAutoRefreshWeather", () => {
  test("fresh live data does not refresh", () => {
    assert.equal(decide(), false);
  });

  test("data older than the staleness threshold refreshes", () => {
    assert.equal(
      decide({ weatherFetchedAt: NOW - AUTO_REFRESH_STALE_AFTER_MS }),
      true
    );
  });

  test("an error state refreshes regardless of data age", () => {
    assert.equal(decide({ hasError: true }), true);
  });

  test("a restored cache refreshes at the first opportunity", () => {
    assert.equal(decide({ forecastStatus: "cached" }), true);
  });

  test("never refreshes while offline or hidden", () => {
    assert.equal(decide({ hasError: true, isOffline: true }), false);
    assert.equal(decide({ hasError: true, isVisible: false }), false);
  });

  test("respects the minimum interval between automatic attempts", () => {
    assert.equal(
      decide({
        hasError: true,
        lastAttemptAt: NOW - AUTO_REFRESH_MIN_INTERVAL_MS + 1,
      }),
      false
    );
    assert.equal(
      decide({
        hasError: true,
        lastAttemptAt: NOW - AUTO_REFRESH_MIN_INTERVAL_MS,
      }),
      true
    );
  });

  test("a boot that never settled does not auto-fire", () => {
    assert.equal(
      decide({ weatherFetchedAt: null, forecastStatus: "idle" }),
      false
    );
    assert.equal(
      decide({ weatherFetchedAt: null, forecastStatus: "loading" }),
      false
    );
  });

  test("a ready state with no timestamp (defensive) refreshes", () => {
    assert.equal(
      decide({ weatherFetchedAt: null, forecastStatus: "ready" }),
      true
    );
  });

  test("rejects nonsense clocks instead of guessing", () => {
    assert.equal(decide({ nowMs: null }), false);
    assert.equal(decide({ nowMs: "soon" }), false);
  });
});
