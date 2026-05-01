import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { MAX_SAVED_CITIES } from "../hooks/useLocation.js";
import {
  createSavedLocationsSyncAccount,
  pullSavedLocationsFromSync,
  pushSavedLocationsToSync,
} from "./savedLocationsSync.js";

const realFetch = globalThis.fetch;

function createJsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
}

function buildCity(index) {
  return {
    lat: 10 + index,
    lon: 20 + index,
    name: `City ${index}`,
    country: "Testland",
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("saved location sync service", () => {
  test("creates sync accounts with normalized cities capped to the local product limit", async () => {
    const requestedBodies = [];
    globalThis.fetch = async (_url, options = {}) => {
      requestedBodies.push(JSON.parse(String(options.body)));
      return createJsonResponse(
        {},
        {
          status: 201,
          headers: {
            Location: "https://jsonblob.com/api/jsonBlob/demo-sync-key",
          },
        }
      );
    };

    const seedCities = Array.from({ length: MAX_SAVED_CITIES + 2 }, (_, index) => buildCity(index));
    seedCities.splice(2, 0, { ...seedCities[1] });

    const result = await createSavedLocationsSyncAccount(seedCities);

    assert.equal(result.syncKey, "https://jsonblob.com/api/jsonBlob/demo-sync-key");
    assert.equal(requestedBodies.length, 1);
    assert.equal(requestedBodies[0].savedCities.length, MAX_SAVED_CITIES);
    assert.deepEqual(requestedBodies[0].savedCities[0], buildCity(0));
  });

  test("pulls and normalizes synced locations using the same saved-city cap", async () => {
    globalThis.fetch = async () =>
      createJsonResponse({
        savedCities: [
          buildCity(0),
          buildCity(1),
          buildCity(1),
          ...Array.from({ length: MAX_SAVED_CITIES + 3 }, (_, index) => buildCity(index + 2)),
        ],
      });

    const savedCities = await pullSavedLocationsFromSync(
      "https://jsonblob.com/api/jsonBlob/demo-sync-key"
    );

    assert.equal(savedCities.length, MAX_SAVED_CITIES);
    assert.deepEqual(savedCities[0], buildCity(0));
    assert.deepEqual(savedCities[1], buildCity(1));
  });

  test("surfaces API-provided sync errors on push", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        { message: "Sync quota reached" },
        { status: 429 }
      );

    await assert.rejects(
      pushSavedLocationsToSync(
        "https://jsonblob.com/api/jsonBlob/demo-sync-key",
        [buildCity(0)]
      ),
      /Sync quota reached/
    );
  });
});
