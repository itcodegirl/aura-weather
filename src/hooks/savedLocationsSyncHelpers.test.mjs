import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deserializeSyncAccount,
  formatPullSuccessMessage,
  getSavedCitiesSignature,
  mergeSavedCities,
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
        "Synced 1 saved location"
      );
    });

    test("uses the plural form for multiple locations", () => {
      assert.equal(
        formatPullSuccessMessage(
          [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
          2,
          false
        ),
        "Synced 2 saved locations"
      );
    });

    test("calls out trimming when applicable", () => {
      assert.equal(
        formatPullSuccessMessage(
          [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
          6,
          true
        ),
        "Synced 6 saved locations (kept newest 6)"
      );
    });

    test("returns the connected fallback when no remote cities exist", () => {
      assert.equal(formatPullSuccessMessage([], 0, false), "Sync connected");
      assert.equal(
        formatPullSuccessMessage(null, 0, false),
        "Sync connected"
      );
    });
  });
});
