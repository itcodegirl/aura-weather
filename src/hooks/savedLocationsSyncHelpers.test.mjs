import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deserializeSyncAccount,
  formatPullSuccessMessage,
  getSavedCitiesSignature,
  mergeSavedCities,
  buildStopBackupState,
  runStopBackupSequence,
  serializeSyncAccount,
} from "./savedLocationsSyncHelpers.js";

describe("saved locations sync helpers", () => {
  describe("deserializeSyncAccount", () => {
    test("returns the parsed account when it has a usable syncKey", () => {
      const result = deserializeSyncAccount(
        JSON.stringify({ syncKey: "abc123" })
      );
      assert.deepEqual(result, { syncKey: "abc123" });
    });

    test("trims surrounding whitespace from the syncKey", () => {
      const result = deserializeSyncAccount(
        JSON.stringify({ syncKey: "  spaced  " })
      );
      assert.deepEqual(result, { syncKey: "spaced" });
    });

    test("returns null when the value is missing or malformed", () => {
      assert.equal(deserializeSyncAccount(""), null);
      assert.equal(deserializeSyncAccount("not-json"), null);
      assert.equal(deserializeSyncAccount("null"), null);
      assert.equal(deserializeSyncAccount(JSON.stringify({})), null);
      assert.equal(
        deserializeSyncAccount(JSON.stringify({ syncKey: "" })),
        null
      );
      assert.equal(
        deserializeSyncAccount(JSON.stringify({ syncKey: 42 })),
        null
      );
    });
  });

  describe("serializeSyncAccount", () => {
    test("serializes a valid account into a string with a trimmed key", () => {
      assert.equal(
        serializeSyncAccount({ syncKey: "  abc123  " }),
        JSON.stringify({ syncKey: "abc123" })
      );
    });

    test("returns an empty string for nullish or non-object values", () => {
      assert.equal(serializeSyncAccount(null), "");
      assert.equal(serializeSyncAccount(undefined), "");
      assert.equal(serializeSyncAccount("string"), "");
      assert.equal(serializeSyncAccount(123), "");
    });
  });

  describe("getSavedCitiesSignature", () => {
    test("produces the same signature for equivalent arrays", () => {
      const cities = [
        { lat: 41.8, lon: -87.6, name: "Chicago", country: "United States" },
        { lat: 35.7, lon: 139.7, name: "Tokyo", country: "Japan" },
      ];
      assert.equal(
        getSavedCitiesSignature(cities),
        getSavedCitiesSignature([...cities])
      );
    });

    test("changes when any meaningful field changes", () => {
      const baseline = getSavedCitiesSignature([
        { lat: 41.8, lon: -87.6, name: "Chicago", country: "United States" },
      ]);
      const renamed = getSavedCitiesSignature([
        { lat: 41.8, lon: -87.6, name: "Chicago Heights", country: "United States" },
      ]);
      assert.notEqual(baseline, renamed);
    });

    test("treats non-array input as empty", () => {
      assert.equal(getSavedCitiesSignature(null), "[]");
      assert.equal(getSavedCitiesSignature(undefined), "[]");
      assert.equal(getSavedCitiesSignature({}), "[]");
    });
  });

  describe("mergeSavedCities", () => {
    test("dedupes by lat/lon and prefers the local entry", () => {
      const local = [
        { lat: 41.8781, lon: -87.6298, name: "Chicago Local", country: "US" },
      ];
      const remote = [
        {
          lat: 41.87810001,
          lon: -87.62980001,
          name: "Chicago Remote",
          country: "US",
        },
        { lat: 35.6, lon: 139.7, name: "Tokyo", country: "Japan" },
      ];

      const { cities, wasTrimmed } = mergeSavedCities(local, remote);

      assert.equal(cities.length, 2);
      assert.equal(cities[0].name, "Chicago Local");
      assert.equal(cities[1].name, "Tokyo");
      assert.equal(wasTrimmed, false);
    });

    test("ignores entries with invalid coordinates", () => {
      const merged = mergeSavedCities(
        [{ lat: "abc", lon: 10, name: "Bad" }],
        [{ lat: 1, lon: 2, name: "Good" }]
      );
      assert.equal(merged.cities.length, 1);
      assert.equal(merged.cities[0].name, "Good");
    });

    test("trims to MAX_SAVED_CITIES and reports trimming", () => {
      const lotsOfCities = Array.from({ length: 10 }, (_, i) => ({
        lat: i,
        lon: i,
        name: `City ${i}`,
      }));
      const { cities, wasTrimmed } = mergeSavedCities(lotsOfCities, []);
      assert.equal(cities.length, 6);
      assert.equal(wasTrimmed, true);
    });

    test("falls back to placeholder names for missing labels", () => {
      const { cities } = mergeSavedCities(
        [{ lat: 1, lon: 2 }],
        []
      );
      assert.equal(cities[0].name, "Saved place");
      assert.equal(cities[0].country, "");
    });
  });

  describe("formatPullSuccessMessage", () => {
    test("uses the singular form for one location", () => {
      assert.equal(
        formatPullSuccessMessage([{ lat: 1, lon: 2 }], 1, false),
        "Restored 1 saved location"
      );
    });

    test("uses the plural form for multiple locations", () => {
      assert.equal(
        formatPullSuccessMessage(
          [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
          2,
          false
        ),
        "Restored 2 saved locations"
      );
    });

    test("calls out trimming when applicable", () => {
      assert.equal(
        formatPullSuccessMessage(
          [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
          6,
          true
        ),
        "Restored 6 saved locations (kept newest 6)"
      );
    });

    test("returns the connected fallback when no remote cities exist", () => {
      assert.equal(formatPullSuccessMessage([], 0, false), "Backed up");
      assert.equal(
        formatPullSuccessMessage(null, 0, false),
        "Backed up"
      );
    });
  });
});

describe("runStopBackupSequence", () => {
  test("cancels the pending push before awaiting anything", async () => {
    const calls = [];
    let cancelledBeforeFirstAwait = false;

    await runStopBackupSequence({
      cancelPendingPush: () => {
        calls.push("cancel");
        // Synchronous by contract: the debounce timer is a live macrotask, so
        // any await before this gives it a window to fire and re-upsert.
        cancelledBeforeFirstAwait = true;
      },
      waitForInFlightPush: () => {
        assert.ok(cancelledBeforeFirstAwait, "cancel must run before the first await");
        calls.push("wait");
        return Promise.resolve();
      },
      deleteBackup: () => {
        calls.push("delete");
        return Promise.resolve();
      },
    });

    assert.deepEqual(calls, ["cancel", "wait", "delete"]);
  });

  test("deletes only after an in-flight push has settled", async () => {
    const calls = [];
    let releasePush;
    const pushPromise = new Promise((resolve) => {
      releasePush = resolve;
    });

    const sequence = runStopBackupSequence({
      cancelPendingPush: () => calls.push("cancel"),
      waitForInFlightPush: () => pushPromise.then(() => calls.push("push settled")),
      deleteBackup: () => {
        calls.push("delete");
        return Promise.resolve();
      },
    });

    await Promise.resolve();
    assert.ok(!calls.includes("delete"), "the delete must wait for the push on the wire");

    releasePush();
    await sequence;

    // Reversed, the push's upsert would land after the delete and silently
    // recreate the row the user asked to remove.
    assert.deepEqual(calls, ["cancel", "push settled", "delete"]);
  });

  test("still deletes when the in-flight push failed", async () => {
    const calls = [];

    await runStopBackupSequence({
      cancelPendingPush: () => calls.push("cancel"),
      waitForInFlightPush: () => Promise.reject(new Error("network down")),
      deleteBackup: () => {
        calls.push("delete");
        return Promise.resolve();
      },
    });

    assert.deepEqual(calls, ["cancel", "delete"], "a failed push must not block stopping");
  });

  test("tolerates no push being in flight", async () => {
    const calls = [];

    await runStopBackupSequence({
      cancelPendingPush: () => calls.push("cancel"),
      waitForInFlightPush: () => null,
      deleteBackup: () => {
        calls.push("delete");
        return Promise.resolve();
      },
    });

    assert.deepEqual(calls, ["cancel", "delete"]);
  });

  test("surfaces a failed delete so the caller can report it honestly", async () => {
    await assert.rejects(
      runStopBackupSequence({
        cancelPendingPush: () => {},
        waitForInFlightPush: () => Promise.resolve(),
        deleteBackup: () => Promise.reject(new Error("permission denied")),
      }),
      /permission denied/
    );
  });
});

describe("buildStopBackupState", () => {
  test("reports a clean stop when the cloud row was removed", () => {
    assert.deepEqual(buildStopBackupState(null), {
      status: "idle",
      message: "Backup stopped",
      error: null,
      lastSyncedAt: null,
    });
  });

  test("says the cloud copy remains when the delete failed", () => {
    const state = buildStopBackupState("permission denied for table saved_cities");

    // The headline is the panel's most prominent line. A bare "Backup stopped"
    // here would assert a removal that did not happen, leaving the truth to
    // the error text underneath it.
    assert.equal(state.status, "error");
    assert.equal(state.message, "Backup stopped, cloud copy remains");
    assert.equal(state.error, "permission denied for table saved_cities");
  });

  test("never claims a clean stop while carrying an error", () => {
    for (const failure of ["network down", "permission denied", "boom"]) {
      const state = buildStopBackupState(failure);
      assert.notEqual(
        state.message,
        "Backup stopped",
        "an unremoved cloud copy must not read as a completed stop"
      );
      assert.equal(state.status, "error");
    }
  });
});

describe("getSavedCitiesSignature sentinel safety", () => {
  test("never returns the empty string, for any input", () => {
    // useSavedLocationsSync seeds lastSyncedSignatureRef to decide whether
    // anything has changed since the last successful sync. It used to seed
    // "", which this function can never produce — an empty list serialises
    // to "[]" — so the "nothing changed" short-circuit was unreachable on
    // the first commit and every cold start armed an auto-push of state
    // that had not changed. That push raced the initial restore, invalidated
    // its shared request ticket, and overwrote the cloud row with local
    // state. Any future sentinel must stay outside this function's range.
    const inputs = [
      undefined,
      null,
      [],
      "not-an-array",
      [{}],
      [{ lat: 1, lon: 2, name: "A", country: "US" }],
    ];

    for (const input of inputs) {
      const signature = getSavedCitiesSignature(input);
      assert.equal(typeof signature, "string");
      assert.notEqual(
        signature,
        "",
        `"" must never be a producible signature (input: ${JSON.stringify(input)})`
      );
    }
  });

  test("an empty list is distinguishable from an unset sentinel", () => {
    assert.equal(getSavedCitiesSignature([]), "[]");
  });
});
