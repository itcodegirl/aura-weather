// Backup-state hygiene across a disconnect: stopping the backup raises the
// "skip the next auto-push" flag for an account it then drops, and nothing
// downstream can consume a flag whose account no longer exists — the push
// effect returns on the missing syncKey first. The flag therefore outlives
// the account that justified it, and the next render that *would* have
// pushed spends it instead.
//
// Driven through the hook's `options.client` seam (the same one
// services/savedLocationsSync.js exposes), so these tests exercise the real
// effect/debounce plumbing against a fake Supabase client and can count what
// actually reached the wire.

import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { useSavedLocationsSync } = await import("./useSavedLocationsSync.js");

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const SYNC_ACCOUNT_KEY = "aura-weather-sync-account-v2";
// The hook debounces auto-pushes by 900 ms. Waits poll past that with room
// to spare: `node --test` runs these files concurrently, so a fixed sleep
// sized to the debounce is a flake waiting to happen.
const PUSH_TIMEOUT_MS = 6000;

function buildCity(index) {
  return {
    lat: 10 + index,
    lon: 20 + index,
    name: `City ${index}`,
    country: "Testland",
  };
}

/**
 * Mirrors the fake client in services/savedLocationsSync.test.mjs, plus a
 * one-shot `gate`: set it to a promise and the next write stays in flight
 * until that promise resolves.
 */
function createFakeClient() {
  const calls = { upserts: [], deletes: [], signInCount: 0 };
  const client = {
    calls,
    gate: null,
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => {
        calls.signInCount += 1;
        return { data: { user: USER }, error: null };
      },
    },
    from() {
      return {
        upsert: async (row) => {
          if (client.gate) {
            const pending = client.gate;
            client.gate = null;
            await pending;
          }
          calls.upserts.push(row);
          return { error: null };
        },
        select: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        delete: () => ({
          eq: async (column, value) => {
            calls.deletes.push({ column, value });
            return { error: null };
          },
        }),
      };
    },
  };

  return client;
}

function cityNames(row) {
  return row.cities.map((city) => city.name).join(",");
}

function SyncProbe({ client, onApi }) {
  const [savedCities, setSavedCities] = React.useState([buildCity(0)]);
  const sync = useSavedLocationsSync(savedCities, setSavedCities, { client });

  React.useEffect(() => {
    onApi({ ...sync, savedCities, setSavedCities });
  });

  return null;
}

function renderProbe(client) {
  let latest = null;
  render(
    React.createElement(SyncProbe, {
      client,
      onApi(api) {
        latest = api;
      },
    })
  );

  return {
    read: () => latest,
    async call(name) {
      await act(async () => {
        await latest[name]();
      });
    },
    async addCity(city) {
      await act(async () => {
        latest.setSavedCities((previous) => [...previous, city]);
      });
    },
    async waitForUpserts(count) {
      await waitFor(
        () => assert.equal(client.calls.upserts.length, count),
        { timeout: PUSH_TIMEOUT_MS, interval: 25 }
      );
    },
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(SYNC_ACCOUNT_KEY);
});

describe("useSavedLocationsSync", () => {
  test("backs up the first edit made after reconnecting", async () => {
    const client = createFakeClient();
    const probe = renderProbe(client);

    await probe.call("createSyncAccount");
    assert.equal(client.calls.upserts.length, 1, "the account seeds the row");

    await probe.addCity(buildCity(1));
    await probe.waitForUpserts(2); // the edit is auto-pushed

    await probe.call("disconnectSyncAccount");
    assert.equal(client.calls.deletes.length, 1, "the cloud row is deleted");
    assert.equal(probe.read().syncConnected, false);

    await probe.call("createSyncAccount");
    assert.equal(client.calls.upserts.length, 3, "reconnecting reseeds the row");
    assert.equal(probe.read().syncConnected, true);

    await probe.addCity(buildCity(2));
    await probe.waitForUpserts(4);

    assert.equal(
      cityNames(client.calls.upserts.at(-1)),
      "City 0,City 1,City 2",
      "the first edit after a reconnect must reach the cloud, not wait for the next one"
    );
    assert.equal(probe.read().syncState.status, "ready");
  });

  test("backs up an edit made while the reconnect is still in flight", async () => {
    // Where a skip flag left over from the disconnect actually bites. The
    // reconnect's seeding upsert carries the list as it stood when the user
    // pressed the button; an edit landing before that request returns is not
    // in it, so the account-change render is the one that owes a push — and
    // it is exactly the render a surviving flag spends.
    const client = createFakeClient();
    const probe = renderProbe(client);

    await probe.call("createSyncAccount");
    await probe.call("disconnectSyncAccount");

    let releaseCreate = null;
    client.gate = new Promise((resolve) => {
      releaseCreate = resolve;
    });

    let reconnecting = null;
    await act(async () => {
      reconnecting = probe.read().createSyncAccount();
    });
    await probe.addCity(buildCity(1));
    await act(async () => {
      releaseCreate();
      await reconnecting;
    });

    assert.equal(
      cityNames(client.calls.upserts.at(-1)),
      "City 0",
      "the seeding upsert predates the edit"
    );

    await probe.waitForUpserts(3);

    assert.equal(
      cityNames(client.calls.upserts.at(-1)),
      "City 0,City 1",
      "the edit that raced the reconnect must still be backed up"
    );
    assert.equal(probe.read().syncState.status, "ready");
  });
});
