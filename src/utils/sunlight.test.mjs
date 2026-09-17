import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatSunClock,
  formatDaylightLengthLabel,
  getSunlightPhase,
  getDaylightProgress,
  isAfterSunset,
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

  test("getDaylightProgress resolves a remote location's sun times", () => {
    // 2026-06-15 03:00 UTC is 12:00 in Tokyo (UTC+9, no DST). The naive
    // 04:00 sunrise and 20:00 sunset resolve through that zone to real
    // instants 16 hours apart, and noon sits exactly halfway. Holds
    // regardless of the test machine's own zone, which is the point.
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

  test("getDaylightProgress returns null for a run-out pair, not 1", () => {
    // The clamp is the defect. Math.min(1, ...) turns EVERY moment past
    // sunset into exactly 1.0, so AtmosphereBento's `progress !== null`
    // guard cannot reject it: the bead drew parked at the end of the arc
    // from a snapshot 149 days old, indistinguishable from the sun having
    // just gone down.
    const readAt = Date.UTC(2026, 8, 17, 17, 0);
    assert.equal(
      getDaylightProgress("2026-04-21T11:00:00Z", "2026-04-21T23:00:00Z", readAt),
      null
    );
  });

  test("getDaylightProgress still clamps to 1 for an ordinary evening", () => {
    // The control that stops this being fixed by hiding the bead every
    // night. An evening past sunset is a real state and must still draw.
    const sunsetMs = Date.parse("2026-06-15T20:00:00Z");
    const twoHoursLater = sunsetMs + 2 * 60 * 60 * 1000;
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00Z", "2026-06-15T20:00:00Z", twoHoursLater),
      1
    );
    // ...and right up to the one-day boundary, so the whole overnight holds.
    const justUnderADay = sunsetMs + 24 * 60 * 60 * 1000;
    assert.equal(
      getDaylightProgress("2026-06-15T04:00:00Z", "2026-06-15T20:00:00Z", justUnderADay),
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

/*
 * The narrower question isDaylight cannot answer. isDaylight returns false
 * for "after sunset", "before sunrise" and "cannot tell" alike, which is
 * right for suppressing advice but wrong for a caller that must choose
 * between present and past tense.
 */
describe("isAfterSunset", () => {
  const SUNSET = "2026-04-21T23:00:00Z";
  const at = (h, m = 0) => Date.UTC(2026, 3, 21, h, m, 0);

  test("is true only once the sun is down", () => {
    assert.equal(isAfterSunset(SUNSET, at(23, 1)), true);
    assert.equal(isAfterSunset(SUNSET, Date.UTC(2026, 3, 22, 4)), true);
  });

  test("is false at sunset itself and every hour before it", () => {
    // Exclusive at sunset, where isDaylight is inclusive — the two agree
    // that the final minute of the day is still day.
    assert.equal(isAfterSunset(SUNSET, at(23)), false, "sunset is not yet past");
    assert.equal(isAfterSunset(SUNSET, at(18)), false);
    assert.equal(isAfterSunset(SUNSET, at(9)), false, "pre-dawn is not after sunset");
  });

  test("never guesses: an unplaceable clock is not a finished day", () => {
    // The caller renders past tense on true, so a guess here would tell a
    // reader their peak "was" high while it is still climbing.
    assert.equal(isAfterSunset(SUNSET, null), false);
    assert.equal(isAfterSunset(SUNSET, NaN), false);
    assert.equal(isAfterSunset(SUNSET, "23:30"), false);
    // Infinity is the input that makes the finite-clock guard load-bearing:
    // a bare `now > sunset` answers true for it and would strand the panel
    // in past tense. The others coerce to NaN and compare false anyway.
    assert.equal(isAfterSunset(SUNSET, Infinity), false);
    assert.equal(isAfterSunset(null, at(23, 1)), false);
    assert.equal(isAfterSunset(undefined, at(23, 1)), false);
    assert.equal(isAfterSunset("not-a-time", at(23, 1)), false);
  });
});

describe("the sun window on a DST day", () => {
  /*
   * Sunrise and sunset are the provider's naive location-local strings, the
   * same shape as the hourly series, and these helpers used to parse them in
   * the device's zone against a "now" reframed to match. The two cancelled
   * out until the device's own transition day. These pin the zone-resolved
   * behaviour: the sun times are placed by the location's clock, and "now"
   * is the real one.
   */
  const CHICAGO = "America/Chicago";

  test("sunrise resolves through the location's zone, not the device's", () => {
    // 2026-11-01 is Chicago's fall-back day. A 07:15 sunrise is after the
    // 02:00 transition, so it is on CST (-6): 13:15 UTC.
    const sunrise = "2026-11-01T07:15:00";
    const sunset = "2026-11-01T17:45:00";
    const justAfterSunrise = Date.UTC(2026, 10, 1, 13, 20);

    assert.equal(isDaylight(sunrise, sunset, justAfterSunrise, CHICAGO), true);
    // An hour earlier is the reading a single fixed CDT offset would have
    // produced, and it is before sunrise.
    assert.equal(
      isDaylight(sunrise, sunset, Date.UTC(2026, 10, 1, 12, 20), CHICAGO),
      false
    );
  });

  test("after-sunset is placed by the location's clock", () => {
    const sunset = "2026-11-01T17:45:00"; // CST, so 23:45 UTC
    assert.equal(isAfterSunset(sunset, Date.UTC(2026, 10, 1, 23, 50), CHICAGO), true);
    assert.equal(isAfterSunset(sunset, Date.UTC(2026, 10, 1, 23, 40), CHICAGO), false);
  });

  test("the golden-hour phase uses the same resolution", () => {
    const sunrise = "2026-11-01T07:15:00";
    const sunset = "2026-11-01T17:45:00";
    assert.equal(
      getSunlightPhase(sunrise, sunset, Date.UTC(2026, 10, 1, 23, 50), {
        timeZone: CHICAGO,
      }),
      "sunset"
    );
    assert.equal(
      getSunlightPhase(sunrise, sunset, Date.UTC(2026, 10, 1, 13, 20), {
        timeZone: CHICAGO,
      }),
      "sunrise"
    );
  });

  test("daylight length is the duration actually lived, not the naive one", () => {
    // 2026-03-08 is the spring-forward day: the clock jumps 02:00 -> 03:00,
    // so a 06:30-to-18:00 wall-clock span is 11 hr 30 min on the face of it
    // but only 10 hr 30 min of real time. Sunrise is before the transition
    // (CST) and sunset after it (CDT).
    const lived = formatDaylightLengthLabel(
      "2026-03-08T01:30:00",
      "2026-03-08T18:00:00",
      { timeZone: CHICAGO }
    );
    const naive = formatDaylightLengthLabel(
      "2026-03-08T01:30:00",
      "2026-03-08T18:00:00"
    );
    assert.equal(lived, "15 hr 30 min");
    assert.notEqual(lived, naive);
  });

  test("a run-out pair is not a finished day either", () => {
    // The e2e fixtures carried this exact shape for five months: a sun pair
    // dated 2026-04-21 read at 2026-09-17. `now > sunsetMs` is true of a
    // sunset two hours ago and of one 149 days ago alike, and the hero's UV
    // panel renders past tense on true — "midday exposure was best avoided"
    // about a midday five months gone.
    const RUN_OUT_SUNSET = "2026-04-21T23:00:00Z";
    const READ_AT = Date.UTC(2026, 8, 17, 17, 0);
    assert.equal(isAfterSunset(RUN_OUT_SUNSET, READ_AT), false);
  });

  test("the run-out boundary is one day, and it is not off by one", () => {
    // A pair describes one day. Exactly a day past sunset is still that
    // day's evening; past that it describes nothing about now.
    const SUNSET_MS = Date.parse("2026-04-21T23:00:00Z");
    const DAY = 24 * 60 * 60 * 1000;
    assert.equal(isAfterSunset(SUNSET_MS, SUNSET_MS + DAY), true, "a day past is the boundary, still inside");
    assert.equal(isAfterSunset(SUNSET_MS, SUNSET_MS + DAY + 1), false, "a millisecond beyond it is run out");
  });

  test("an unknown zone answers false rather than falling back to the device", () => {
    // The zone comes from the provider. If the runtime cannot place it, the
    // daylight question has no honest answer, and these must not guess one.
    assert.equal(
      isDaylight("2026-11-01T07:15:00", "2026-11-01T17:45:00", Date.now(), "Not/AZone"),
      false
    );
    assert.equal(
      isAfterSunset("2026-11-01T17:45:00", Date.now(), "Not/AZone"),
      false
    );
  });
});
