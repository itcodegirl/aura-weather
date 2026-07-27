import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createAlertRequestTracker,
  sameLocation,
} from "./rainAlertHelpers.js";

const CHICAGO = { lat: 41.8781, lon: -87.6298 };

describe("sameLocation", () => {
  test("matches when rule and location agree within tolerance", () => {
    const rule = { location_lat: 41.87812, location_lon: -87.62983 };
    assert.equal(sameLocation(rule, CHICAGO), true);
  });

  test("accepts numeric-string coordinates from the backend", () => {
    const rule = { location_lat: "41.8781", location_lon: "-87.6298" };
    assert.equal(sameLocation(rule, CHICAGO), true);
  });

  test("does not match when coordinates differ beyond tolerance", () => {
    const rule = { location_lat: 41.9, location_lon: -87.6298 };
    assert.equal(sameLocation(rule, CHICAGO), false);
  });

  test("a rule with null coordinates never matches, even at (0, 0)", () => {
    // Number(null) is 0 — without the toFiniteNumber gate a malformed
    // row would pin itself to Null Island and match a location there.
    const rule = { location_lat: null, location_lon: null };
    assert.equal(sameLocation(rule, { lat: 0, lon: 0 }), false);
  });

  test("returns false when the active location is missing", () => {
    const rule = { location_lat: 41.8781, location_lon: -87.6298 };
    assert.equal(sameLocation(rule, null), false);
    assert.equal(sameLocation(rule, undefined), false);
  });

  test("rejects non-numeric coordinate shapes", () => {
    assert.equal(
      sameLocation({ location_lat: "", location_lon: -87.6298 }, CHICAGO),
      false
    );
    assert.equal(
      sameLocation({ location_lat: true, location_lon: -87.6298 }, CHICAGO),
      false
    );
  });
});

describe("createAlertRequestTracker", () => {
  test("the first ticket is current and carries a live signal", () => {
    const tracker = createAlertRequestTracker();
    const { id, signal } = tracker.start();
    assert.equal(tracker.isCurrent(id), true);
    assert.equal(signal.aborted, false);
  });

  test("starting a new load aborts the previous request", () => {
    const tracker = createAlertRequestTracker();
    const first = tracker.start();
    const second = tracker.start();
    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);
  });

  test("a superseded ticket may no longer write state", () => {
    // The case the id guard exists for: getExistingSubscription reads the
    // service worker and takes no signal, so a superseded call still
    // resolves. Its ticket must not be current.
    const tracker = createAlertRequestTracker();
    const stale = tracker.start();
    const fresh = tracker.start();
    assert.equal(tracker.isCurrent(stale.id), false);
    assert.equal(tracker.isCurrent(fresh.id), true);
  });

  test("abort() ends the in-flight load and invalidates its ticket", () => {
    const tracker = createAlertRequestTracker();
    const { id, signal } = tracker.start();
    tracker.abort();
    assert.equal(signal.aborted, true);
    assert.equal(tracker.isCurrent(id), false);
  });

  test("abort() is safe before any load and repeatable afterwards", () => {
    const tracker = createAlertRequestTracker();
    assert.doesNotThrow(() => tracker.abort());
    const { signal } = tracker.start();
    tracker.abort();
    assert.doesNotThrow(() => tracker.abort());
    assert.equal(signal.aborted, true);
  });

  test("tickets are independent across trackers", () => {
    const a = createAlertRequestTracker();
    const b = createAlertRequestTracker();
    const ticketA = a.start();
    b.start();
    b.abort();
    assert.equal(a.isCurrent(ticketA.id), true);
    assert.equal(ticketA.signal.aborted, false);
  });
});
