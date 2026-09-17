import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { toEpochMs, zonedWallClockToEpoch } from "./zonedTime.js";

const CHICAGO = "America/Chicago";
const TOKYO = "Asia/Tokyo";

function iso(epochMs) {
  return new Date(epochMs).toISOString();
}

/**
 * Runs `source` in a child node process whose *device* zone is `tz`.
 *
 * The bug this module fixes lives in how the device zone parses the
 * provider's naive strings, so it is invisible unless the device zone is one
 * that transitions — and on the two days it does. A test in the repo's own
 * UTC runtime cannot see it.
 */
function runInDeviceZone(tz, source) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  }).trim();
}

const MODULE_URL = new URL("./zonedTime.js", import.meta.url).href;
const SERIES_URL = new URL("./timeSeries.js", import.meta.url).href;

describe("zonedWallClockToEpoch", () => {
  test("resolves an ordinary wall clock through the zone, not the device", () => {
    // Controls first: on days with no transition the answer is simply the
    // standing offset, CST (-6) in January and CDT (-5) in June.
    assert.equal(
      iso(zonedWallClockToEpoch("2026-01-15T12:00", CHICAGO)),
      "2026-01-15T18:00:00.000Z"
    );
    assert.equal(
      iso(zonedWallClockToEpoch("2026-06-01T12:00", CHICAGO)),
      "2026-06-01T17:00:00.000Z"
    );
    assert.equal(
      iso(zonedWallClockToEpoch("2026-06-01T12:00", TOKYO)),
      "2026-06-01T03:00:00.000Z"
    );
  });

  test("spring forward: the hours either side land an hour apart", () => {
    // 2026-03-08 in America/Chicago: 02:00 never happens, the clock goes
    // 01:59 -> 03:00, and the offset moves from -6 to -5.
    const before = zonedWallClockToEpoch("2026-03-08T01:00", CHICAGO);
    const after = zonedWallClockToEpoch("2026-03-08T03:00", CHICAGO);

    assert.equal(iso(before), "2026-03-08T07:00:00.000Z");
    assert.equal(iso(after), "2026-03-08T08:00:00.000Z");
    assert.equal(after - before, 60 * 60 * 1000);
  });

  test("spring forward: a wall clock that never happened resolves, not throws", () => {
    // 02:00 has no instant. Returning the instant 01:00 names is the least
    // surprising answer — it is when that reading would have been taken had
    // the clock not jumped — and it keeps the series monotonic.
    const skipped = zonedWallClockToEpoch("2026-03-08T02:00", CHICAGO);
    assert.equal(iso(skipped), "2026-03-08T07:00:00.000Z");
  });

  test("fall back: the repeated hour resolves to its first occurrence", () => {
    // 2026-11-01 in America/Chicago: 01:00 happens twice, at 06:00Z on CDT
    // and again at 07:00Z on CST. The provider emits one entry per wall-clock
    // label, so one of the two real hours is absent from the series whatever
    // we choose; taking the earlier keeps it in order.
    assert.equal(
      iso(zonedWallClockToEpoch("2026-11-01T01:00", CHICAGO)),
      "2026-11-01T06:00:00.000Z"
    );
    assert.equal(
      iso(zonedWallClockToEpoch("2026-11-01T02:00", CHICAGO)),
      "2026-11-01T08:00:00.000Z"
    );
  });

  test("fall back: consecutive labels really are two hours apart", () => {
    // This gap is not a bug to be smoothed away. 01:00 and 02:00 on that
    // morning are genuinely two hours apart, because the repeated hour sits
    // between them. A single fixed offset would render it as one hour and
    // put every later reading in the wrong place.
    const series = [
      "2026-10-31T23:00",
      "2026-11-01T00:00",
      "2026-11-01T01:00",
      "2026-11-01T02:00",
      "2026-11-01T03:00",
    ].map((value) => zonedWallClockToEpoch(value, CHICAGO));

    const gapsHours = series
      .slice(1)
      .map((value, index) => (value - series[index]) / 3_600_000);
    assert.deepEqual(gapsHours, [1, 1, 2, 1]);
  });

  test("the single offset the payload carries would get this wrong", () => {
    // `utc_offset_seconds` is one scalar, the offset at request time. The
    // recorded September response for America/Chicago carries -18000 (CDT).
    // Applying it across the location's own November transition puts every
    // reading after it an hour early. Asserted so the shortcut is not
    // reintroduced as a "simplification".
    const OFFSET_MS = -18_000 * 1000;
    const afterTransition = "2026-11-01T02:00";

    const viaFixedOffset = Date.parse(`${afterTransition}Z`) - OFFSET_MS;
    const correct = zonedWallClockToEpoch(afterTransition, CHICAGO);

    assert.equal(iso(viaFixedOffset), "2026-11-01T07:00:00.000Z");
    assert.equal(iso(correct), "2026-11-01T08:00:00.000Z");
    assert.equal(correct - viaFixedOffset, 60 * 60 * 1000);
  });

  test("an unusable zone or timestamp is null, never a guess", () => {
    assert.equal(zonedWallClockToEpoch("2026-06-01T12:00", "Not/AZone"), null);
    assert.equal(zonedWallClockToEpoch("2026-06-01T12:00", ""), null);
    assert.equal(zonedWallClockToEpoch("2026-06-01T12:00", null), null);
    assert.equal(zonedWallClockToEpoch("not-a-time", CHICAGO), null);
    assert.equal(zonedWallClockToEpoch("2026-06-01", CHICAGO), null);
    assert.equal(zonedWallClockToEpoch(null, CHICAGO), null);
    assert.equal(zonedWallClockToEpoch(1_772_953_200_000, CHICAGO), null);
  });
});

describe("toEpochMs", () => {
  test("passes real instants through", () => {
    const epoch = Date.UTC(2026, 5, 1, 17, 0);
    assert.equal(toEpochMs(new Date(epoch), CHICAGO), epoch);
    assert.equal(toEpochMs(epoch, CHICAGO), epoch);
  });

  test("converts a provider string through the zone", () => {
    assert.equal(
      iso(toEpochMs("2026-06-01T12:00", CHICAGO)),
      "2026-06-01T17:00:00.000Z"
    );
  });

  test("without a zone it falls back to the device, which is the old bug", () => {
    // Kept so a caller with no zone still gets an ordering. Every caller in
    // this app passes one; `timeSeries.js` documents that expectation.
    const noZone = toEpochMs("2026-06-01T12:00", null);
    assert.equal(noZone, Date.parse("2026-06-01T12:00"));
  });

  test("rejects what is not a timestamp", () => {
    assert.equal(toEpochMs(undefined, CHICAGO), null);
    assert.equal(toEpochMs(null, CHICAGO), null);
    assert.equal(toEpochMs({}, CHICAGO), null);
    assert.equal(toEpochMs(Number.NaN, CHICAGO), null);
    assert.equal(toEpochMs(new Date("nope"), CHICAGO), null);
  });
});

describe("the hourly window on the device's own DST day", () => {
  // The regression test for the finding. The location here is Tokyo, which
  // has no DST at all — so any collapse or gap comes purely from the device
  // zone misreading the provider's strings.
  test("two slots do not collapse onto one instant", () => {
    const output = runInDeviceZone(
      CHICAGO,
      `
      import { zonedWallClockToEpoch } from ${JSON.stringify(MODULE_URL)};
      import { findWindowStartIndex } from ${JSON.stringify(SERIES_URL)};

      const times = [
        "2026-03-08T01:00",
        "2026-03-08T02:00",
        "2026-03-08T03:00",
        "2026-03-08T04:00",
      ];

      // Positive control: prove this really is the device's transition day,
      // so a pass cannot come from TZ being ignored.
      const deviceParsed = times.map((t) => new Date(t).getTime());
      const deviceCollapsed = deviceParsed[1] === deviceParsed[2];

      // Tokyo never transitions, so these four are four distinct hours.
      const resolved = times.map((t) => zonedWallClockToEpoch(t, "Asia/Tokyo"));
      const distinct = new Set(resolved).size;

      // "Now" is the real instant of the location's 02:00 slot.
      const now = Date.UTC(2026, 2, 7, 17, 0); // 2026-03-08T02:00 in Tokyo
      const index = findWindowStartIndex(times, {
        now,
        timeZone: "Asia/Tokyo",
        currentSlotToleranceMs: 60 * 60 * 1000,
      });

      console.log(JSON.stringify({
        deviceZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceCollapsed,
        distinct,
        index,
        gapsHours: resolved.slice(1).map((v, i) => (v - resolved[i]) / 3600000),
      }));
      `
    );
    const result = JSON.parse(output);

    assert.equal(result.deviceZone, CHICAGO);
    assert.ok(
      result.deviceCollapsed,
      "the device zone must collapse 02:00 and 03:00, or this proves nothing"
    );

    assert.equal(result.distinct, 4);
    assert.deepEqual(result.gapsHours, [1, 1, 1]);
    assert.equal(result.index, 1);
  });
});
