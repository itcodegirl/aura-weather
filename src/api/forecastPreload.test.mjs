import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  claimForecastPreload,
  getForecastRequestOptions,
  resetForecastPreloadForTests,
  startForecastPreload,
} from "./forecastPreload.js";

const realFetch = globalThis.fetch;

function createJsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installForecastFetchSpy() {
  const spy = { calls: 0, urls: [] };
  globalThis.fetch = async (url) => {
    spy.calls += 1;
    spy.urls.push(new URL(String(url)));
    return createJsonResponse({
      latitude: 41.8781,
      longitude: -87.6298,
      timezone: "America/Chicago",
      current: {},
      hourly: {},
      daily: {},
      minutely_15: {},
    });
  };
  return spy;
}

beforeEach(() => {
  resetForecastPreloadForTests();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetForecastPreloadForTests();
});

describe("forecastPreload", () => {
  test("a matching claim adopts the in-flight request without a second fetch", async () => {
    const spy = installForecastFetchSpy();
    const coordinates = { latitude: 41.8781, longitude: -87.6298 };

    const started = startForecastPreload(coordinates);
    assert.ok(started, "expected a preload promise");

    const claimed = claimForecastPreload(coordinates);
    assert.ok(claimed, "expected a claim");
    assert.equal(
      claimed.promise,
      started,
      "claim should carry the same in-flight promise"
    );

    const model = await claimed.promise;
    assert.equal(model.meta.latitude, 41.8781);
    assert.equal(spy.calls, 1, "exactly one network request should fire");
  });

  test("a claim adopted immediately reports the response time as now", async () => {
    installForecastFetchSpy();
    const coordinates = { latitude: 41.8781, longitude: -87.6298 };

    const before = Date.now();
    startForecastPreload(coordinates);
    const claimed = claimForecastPreload(coordinates);
    assert.equal(
      claimed.getRespondedAt(),
      null,
      "no response time before the request settles"
    );

    await claimed.promise;
    const respondedAt = claimed.getRespondedAt();
    assert.ok(
      Number.isFinite(respondedAt),
      "the response time is stamped once the request settles"
    );
    assert.ok(
      respondedAt >= before && respondedAt <= Date.now(),
      "an immediately adopted preload is genuinely as fresh as now"
    );
  });

  test("a claim adopted long after the response reports the real response time", async () => {
    installForecastFetchSpy();
    const coordinates = { latitude: 41.8781, longitude: -87.6298 };
    const staleByMs = 5 * 60 * 1000;

    // Resolve the preload against a clock five minutes in the past, so
    // the claim below is the "boot preload settled while a geolocation
    // prompt sat unanswered" case: settled data, much later adoption.
    const realDateNow = Date.now;
    Date.now = () => realDateNow.call(Date) - staleByMs;
    try {
      await startForecastPreload(coordinates);
    } finally {
      Date.now = realDateNow;
    }

    const claimed = claimForecastPreload(coordinates);
    assert.ok(claimed, "the preload is still claimable");
    await claimed.promise;

    const respondedAt = claimed.getRespondedAt();
    const age = Date.now() - respondedAt;
    assert.ok(
      age >= staleByMs - 1000,
      `adopted preload must report its true age, reported ${age}ms`
    );
  });

  test("uses the canonical imperial forecast units", async () => {
    const spy = installForecastFetchSpy();
    startForecastPreload({ latitude: 41.8781, longitude: -87.6298 });
    await Promise.resolve();
    await Promise.resolve();

    const url = spy.urls[0];
    const options = getForecastRequestOptions();
    assert.equal(url.searchParams.get("temperature_unit"), options.temperatureUnit);
    assert.equal(url.searchParams.get("wind_speed_unit"), options.windSpeedUnit);
    assert.equal(url.searchParams.get("precipitation_unit"), options.precipitationUnit);
    assert.equal(options.temperatureUnit, "fahrenheit");
  });

  test("a coordinate mismatch leaves the preload unclaimed", async () => {
    installForecastFetchSpy();
    startForecastPreload({ latitude: 41.8781, longitude: -87.6298 });

    assert.equal(
      claimForecastPreload({ latitude: 51.5074, longitude: -0.1278 }),
      null,
      "different coordinates must not claim the preload"
    );
    // The original coordinates can still claim it afterwards.
    assert.ok(
      claimForecastPreload({ latitude: 41.8781, longitude: -87.6298 })?.promise
    );
  });

  test("a preload is claimable only once", async () => {
    installForecastFetchSpy();
    const coordinates = { latitude: 41.8781, longitude: -87.6298 };
    startForecastPreload(coordinates);

    assert.ok(claimForecastPreload(coordinates)?.promise, "first claim succeeds");
    assert.equal(
      claimForecastPreload(coordinates),
      null,
      "second claim returns null"
    );
  });

  test("repeat boot calls for the same coordinates do not duplicate the fetch", async () => {
    const spy = installForecastFetchSpy();
    const coordinates = { latitude: 41.8781, longitude: -87.6298 };

    const first = startForecastPreload(coordinates);
    const second = startForecastPreload(coordinates);
    assert.equal(first, second, "same coordinates reuse the in-flight request");
    assert.equal(spy.calls, 1);
  });

  test("claim returns null when nothing was preloaded", () => {
    installForecastFetchSpy();
    assert.equal(
      claimForecastPreload({ latitude: 41.8781, longitude: -87.6298 }),
      null
    );
  });

  test("invalid coordinates do not start a request", () => {
    const spy = installForecastFetchSpy();
    assert.equal(startForecastPreload({ latitude: 999, longitude: 0 }), null);
    assert.equal(startForecastPreload(null), null);
    assert.equal(spy.calls, 0);
  });

  test("an unclaimed rejected preload does not throw an unhandled rejection", async () => {
    globalThis.fetch = async () =>
      new Response("nope", { status: 500 });

    startForecastPreload({ latitude: 41.8781, longitude: -87.6298 });
    // Let the rejected request settle; the module's internal catch should
    // absorb it so no unhandled rejection escapes this tick.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(true);
  });
});
