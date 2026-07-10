// Storage-layer tests for the saved-city cloud backup.
//
// SCOPE, stated plainly: these tests drive the backup service against an
// injected fake Supabase client. They prove the CODE — which table is
// written, that the client never proposes a foreign user_id, that cities are
// capped and de-duplicated before they leave the browser, that an absent row
// reads as "no cities" rather than an error, and that database errors reach
// the user as messages.
//
// They do NOT and CANNOT prove RLS isolation. Row-level security is enforced
// by Postgres, not by this module; a fake client would only be asserting
// against a fake. Isolation is verified against the real database — see
// "Cloud backup — RLS isolation" in docs/qa-checklist.md.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { MAX_SAVED_CITIES } from "../hooks/useLocation.js";
import {
  createSavedLocationsSyncAccount,
  pullSavedLocationsFromSync,
  pushSavedLocationsToSync,
  deleteSavedLocationsBackup,
} from "./savedLocationsSync.js";

const USER = { id: "11111111-1111-4111-8111-111111111111" };

function buildCity(index) {
  return {
    lat: 10 + index,
    lon: 20 + index,
    name: `City ${index}`,
    country: "Testland",
  };
}

/**
 * Minimal stand-in for the supabase-js client, recording every call so the
 * tests can assert on the wire shape. `session: null` forces the anonymous
 * sign-in path, matching a first-time visitor.
 */
function createFakeClient({
  session = null,
  selectResult = { data: null, error: null },
  writeError = null,
  deleteError = null,
} = {}) {
  const calls = { tables: [], upserts: [], deletes: [], signInCount: 0 };

  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously: async () => {
        calls.signInCount += 1;
        return { data: { user: USER }, error: null };
      },
    },
    from(table) {
      calls.tables.push(table);
      return {
        upsert: async (row, options) => {
          calls.upserts.push({ row, options });
          return { error: writeError };
        },
        select: () => ({
          maybeSingle: async () => selectResult,
        }),
        delete: () => ({
          eq: async (column, value) => {
            calls.deletes.push({ column, value });
            return { error: deleteError };
          },
        }),
      };
    },
  };
}

describe("saved-city cloud backup service", () => {
  test("starts a backup on the device's anonymous user and returns its id as a display marker", async () => {
    const client = createFakeClient();

    const result = await createSavedLocationsSyncAccount([buildCity(0)], { client });

    assert.equal(result.syncKey, USER.id);
    assert.equal(client.calls.signInCount, 1, "signs in anonymously when no session exists");
    assert.deepEqual(client.calls.tables, ["saved_cities"]);
  });

  test("reuses an existing session instead of minting a second anonymous user", async () => {
    const client = createFakeClient({ session: { user: USER } });

    await createSavedLocationsSyncAccount([buildCity(0)], { client });

    assert.equal(client.calls.signInCount, 0, "an existing session is reused");
  });

  test("caps and de-duplicates cities before they leave the browser", async () => {
    const client = createFakeClient();
    const seedCities = Array.from({ length: MAX_SAVED_CITIES + 2 }, (_, i) => buildCity(i));
    seedCities.splice(2, 0, { ...seedCities[1] }); // duplicate

    await createSavedLocationsSyncAccount(seedCities, { client });

    const { row, options } = client.calls.upserts[0];
    assert.equal(row.cities.length, MAX_SAVED_CITIES);
    assert.deepEqual(row.cities[0], buildCity(0));
    assert.deepEqual(row.cities[1], buildCity(1));
    assert.deepEqual(row.cities[2], buildCity(2), "the duplicate was dropped, not kept");
    assert.equal(options.onConflict, "user_id");
  });

  test("writes only the caller's own user_id", async () => {
    const client = createFakeClient();

    await pushSavedLocationsToSync([buildCity(0)], { client });

    // The column also defaults to auth.uid() and the RLS with-check rejects a
    // forged id, but the client should never be the one proposing another user.
    assert.equal(client.calls.upserts[0].row.user_id, USER.id);
  });

  test("reads back this user's cities, normalized and capped", async () => {
    const client = createFakeClient({
      selectResult: {
        data: {
          cities: [
            buildCity(0),
            buildCity(1),
            buildCity(1),
            ...Array.from({ length: MAX_SAVED_CITIES + 3 }, (_, i) => buildCity(i + 2)),
          ],
        },
        error: null,
      },
    });

    const savedCities = await pullSavedLocationsFromSync({ client });

    assert.equal(savedCities.length, MAX_SAVED_CITIES);
    assert.deepEqual(savedCities[0], buildCity(0));
    assert.deepEqual(savedCities[1], buildCity(1));
  });

  test("treats a missing row as an empty backup, not an error", async () => {
    // First backup on a fresh device: maybeSingle() resolves to null data.
    const client = createFakeClient({ selectResult: { data: null, error: null } });

    assert.deepEqual(await pullSavedLocationsFromSync({ client }), []);
  });

  test("surfaces database errors on read", async () => {
    const client = createFakeClient({
      selectResult: {
        data: null,
        error: { message: "permission denied for table saved_cities" },
      },
    });

    await assert.rejects(
      pullSavedLocationsFromSync({ client }),
      /permission denied for table saved_cities/
    );
  });

  test("surfaces database errors on write", async () => {
    const client = createFakeClient({
      writeError: { message: "new row violates row-level security policy" },
    });

    await assert.rejects(
      pushSavedLocationsToSync([buildCity(0)], { client }),
      /violates row-level security policy/
    );
  });

  test("stopping the backup deletes this user's row", async () => {
    const client = createFakeClient();

    await deleteSavedLocationsBackup({ client });

    assert.deepEqual(client.calls.deletes, [{ column: "user_id", value: USER.id }]);
  });

  test("reports an unconfigured build instead of throwing a client error", async () => {
    // No injected client, and no Vite env under `node --test`, so
    // getSupabaseClient() resolves to null.
    await assert.rejects(pullSavedLocationsFromSync(), /Cloud backup isn't available/);
  });
});
