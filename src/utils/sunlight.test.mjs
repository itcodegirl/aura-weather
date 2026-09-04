import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatSunClock,
  formatDaylightLengthLabel,
  getSunlightPhase,
  getZonedNowMs,
  getDaylightProgress,
  isDaylight,
} from "./sunlight.js";

describe("sunlight formatting utils", () => {
  test("formats a valid sunrise timestamp", () => {
    const label = formatSunClock("2026-04-21T06:15:00Z");
    assert.notEqual(label, "\u2014");
  });

  test("returns fallback for invalid timestamp", () => {
    assert.equal(formatSunClock("not-a-time"), "\u2014");
  });

  test("returns fallback when timestamp exceeds max future days", () => {
    const farFuture = "2099-01-01T08:00:00Z";
    const label = formatSunClock(farFuture, { maxFutureDays: 10 });
    assert.equal(label, "\u2014");
  });

  test("treats null maxFutureDays as 'no limit' instead of Number(null) === 0", () => {
    // Guard against the Number(null) === 0 trap: a null maxFutureDays
    // should mean "no future-day cap", not "cap at zero days from now"
    // (which would block every future timestamp).
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const label = formatSunClock(tomorrow, { maxFutureDays: null });
    assert.notEqual(label, "\u2014");
  });

  test("ignores boolean maxFutureDays instead of coercing true to 1", () => {
    // Number(true) === 1 would cap at 1 day; toFiniteNumber rejects it
    // so the helper falls through to the unbounded path.
    const farFuture = "2099-01-01T08:00:00Z";
    const label = formatSunClock(farFuture, { maxFutureDays: true });
    assert.notEqual(label, "\u2014");
  });

  test("formats daylight duration from sunrise and sunset", () => {
    const daylight = formatDaylightLengthLabel(
      "2026-04-21T06:00:00Z",
      "2026-04-21T18:30:00Z"
    );
    assert.equal(daylight, "12 hr 30 min");
  });

  test("returns custom fallback for invalid daylight input", () => {
    const daylight = formatDaylightLengthLabel(null, "2026-04-21T18:30:00Z", {
      fallback: "unavailable",
    });
    assert.equal(daylight, "unavailable");
  });

  test("getSunlightPhase returns sunrise within 30 min of sunrise", () => {
    const sunrise = Date.UTC(2026, 3, 21, 11, 0, 0);
    const sunset = Date.UTC(2026, 3, 21, 23, 0, 0);
    const tenMinutesAfterSunrise = sunrise + 10 * 60_000;
    assert.equal(
      getSunlightPhase(sunrise, sunset, tenMinutesAfterSunrise),
      "sunrise"
    );
    assert.equal(
      getSunlightPhase(sunrise, sunset, sunrise - 25 * 60_000),
      "sunrise"
    );
  });

  test("getSunlightPhase returns sunset within 30 min of sunset", () => {
    const sunrise = Date.UTC(2026, 3, 21, 11, 0, 0);
    const sunset = Date.UTC(2026, 3, 21, 23, 0, 0);
    assert.equal(
      getSunlightPhase(sunrise, sunset, sunset + 5 * 60_000),
      "sunset"
    );
  });

  test("getSunlightPhase returns null mid-day and mid-night", () => {
    const sunrise = Date.UTC(2026, 3, 21, 11, 0, 0);
    const sunset = Date.UTC(2026, 3, 21, 23, 0, 0);
    assert.equal(
      getSunlightPhase(sunrise, sunset, Date.UTC(2026, 3, 21, 17, 0, 0)),
      null
    );
    assert.equal(
      getSunlightPhase(sunrise, sunset, Date.UTC(2026, 3, 21, 4, 0, 0)),
      null
    );
  });

  test("getSunlightPhase rejects invalid inputs gracefully", () => {
    assert.equal(getSunlightPhase(null, null, Date.now()), null);
    assert.equal(getSunlightPhase("oops", "oops", Date.now()), null);
    assert.equal(
      getSunlightPhase("2026-04-21T11:00:00Z", "2026-04-21T23:00:00Z", null),
      null
    );
  });

  test("getZonedNowMs keeps an unknown now unknown", () => {
    // A missing "now" must stay null, never silently become the device's
    // current time (getZonedNow's own fallback for a non-finite instant).
    assert.equal(getZonedNowMs("Asia/Tokyo", null), null);
    assert.equal(getZonedNowMs("Asia/Tokyo", Number.NaN), null);
    assert.equal(getZonedNowMs("Asia/Tokyo", undefined), null);
  });

  test("getDaylightProgress reframes now into a remote location's clock", () => {
    // 2026-06-15 03:00 UTC is 12:00 in Tokyo (UTC+9, no DST). Against the
    // naive 04:00 sunrise / 20:00 sunset that is exactly halfway through
    // daylight. The fraction is a ratio of naive-parse differences, so the
    // assertion holds regardless of the test machine's own zone — while a
    // raw device epoch (the bug this guards against) would put the same
    // instant at the device's own wall clock and pin the value elsewhere.
    const nowMs = Date.UTC(2026, 5, 15, 3, 0, 0);
    assert.equal(
      getDaylightProgress(
        "2026-06-15T04:00:00",
        "2026-06-15T20:00:00",
        nowMs,
        "Asia/Tokyo"
      ),
      0.5
    );
  });

  test("getDaylightProgress tracks the device clock when no zone is given", () => {
    // Without a timeZone the reframe is the identity, so a device-local
    // noon between an 04:00 sunrise and 20:00 sunset is halfway through.
    const nowMs = new Date("2026-06-15T12:00:00").getTime();
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00", "2026-06-15T20:00:00", nowMs),
      0.5
    );
  });

  test("getDaylightProgress clamps outside the daylight window", () => {
    const beforeSunrise = new Date("2026-06-15T02:00:00").getTime();
    const afterSunset = new Date("2026-06-15T22:00:00").getTime();
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00", "2026-06-15T20:00:00", beforeSunrise),
      0
    );
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00", "2026-06-15T20:00:00", afterSunset),
      1
    );
  });

  test("getDaylightProgress returns null for uncomputable inputs", () => {
    const nowMs = Date.UTC(2026, 5, 15, 3, 0, 0);
    assert.equal(getDaylightProgress(null, "2026-06-15T20:00:00", nowMs), null);
    assert.equal(getDaylightProgress("2026-06-15T04:00:00", null, nowMs), null);
    assert.equal(getDaylightProgress("oops", "oops", nowMs), null);
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00", "2026-06-15T20:00:00", null),
      null
    );
    // A zero-or-negative daylight span has no meaningful fraction.
    assert.equal(
      getDaylightProgress("2026-06-15T20:00:00", "2026-06-15T04:00:00", nowMs),
      null
    );
  });
});

describe("isDaylight", () => {
  const SUNRISE = "2026-04-21T11:00:00Z";
  const SUNSET = "2026-04-21T23:00:00Z";
  const at = (h, m = 0) => Date.UTC(2026, 3, 21, h, m, 0);

  test("is true strictly inside the window and at both ends", () => {
    assert.equal(isDaylight(SUNRISE, SUNSET, at(18)), true);
    assert.equal(isDaylight(SUNRISE, SUNSET, at(11)), true, "inclusive at sunrise");
    assert.equal(isDaylight(SUNRISE, SUNSET, at(23)), true, "inclusive at sunset");
  });

  test("is false before sunrise and after sunset", () => {
    assert.equal(isDaylight(SUNRISE, SUNSET, at(9)), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, at(10, 59)), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, at(23, 1)), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, Date.UTC(2026, 3, 22, 4)), false);
  });

  test("never guesses: any unusable input is false, not daylight", () => {
    // A caller that cannot place "now" against the sun must not surface
    // advice that only makes sense in daylight.
    assert.equal(isDaylight(null, SUNSET, at(18)), false);
    assert.equal(isDaylight(SUNRISE, undefined, at(18)), false);
    assert.equal(isDaylight("not-a-time", SUNSET, at(18)), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, null), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, NaN), false);
    assert.equal(isDaylight(SUNRISE, SUNSET, "18:00"), false);
  });
});
