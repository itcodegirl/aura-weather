import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_REFRESH_MIN_INTERVAL_MS,
  AUTO_REFRESH_POLL_INTERVAL_MS,
  AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
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

  // ---- visible-tab cadence (poll) contracts -------------------------
  // The poll runs this same policy once a minute with a calmer floor,
  // so a continuously visible tab refreshes ~every staleness window
  // while a failing provider is only re-tried every five minutes.

  test("poll floor is calmer than the event floor", () => {
    assert.ok(AUTO_REFRESH_POLL_MIN_INTERVAL_MS > AUTO_REFRESH_MIN_INTERVAL_MS);
    assert.ok(AUTO_REFRESH_POLL_INTERVAL_MS < AUTO_REFRESH_POLL_MIN_INTERVAL_MS);
  });

  test("stale data on a visible tab refreshes under the poll floor", () => {
    assert.equal(
      decide({
        weatherFetchedAt: NOW - AUTO_REFRESH_STALE_AFTER_MS,
        minAttemptIntervalMs: AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
      }),
      true
    );
  });

  test("an erroring provider is not re-tried before the poll floor elapses", () => {
    assert.equal(
      decide({
        hasError: true,
        lastAttemptAt: NOW - AUTO_REFRESH_POLL_MIN_INTERVAL_MS + 1,
        minAttemptIntervalMs: AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
      }),
      false
    );
    assert.equal(
      decide({
        hasError: true,
        lastAttemptAt: NOW - AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
        minAttemptIntervalMs: AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
      }),
      true
    );
  });

  test("fresh data stays untouched between poll ticks", () => {
    assert.equal(
      decide({
        weatherFetchedAt: NOW - AUTO_REFRESH_STALE_AFTER_MS + 60_000,
        minAttemptIntervalMs: AUTO_REFRESH_POLL_MIN_INTERVAL_MS,
      }),
      false
    );
  });
});
