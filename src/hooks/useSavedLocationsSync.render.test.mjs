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

import "../../scripts/render-test-setup.mjs";

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
function createFakeClient({ cloudCities = null, selectError = null } = {}) {
  const calls = { upserts: [], deletes: [], signInCount: 0, selects: 0 };
  const client = {
    calls,
    gate: null,
    // Second one-shot gate, for the restore. Set it to a promise and the
    // pull stays in flight until that promise resolves, which is the window
    // an auto-push must not fire in.
    selectGate: null,
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
          maybeSingle: async () => {
            if (client.selectGate) {
              const pending = client.selectGate;
              client.selectGate = null;
              await pending;
            }
            calls.selects += 1;
            if (selectError) {
              return { data: null, error: selectError };
            }
            return {
              data: cloudCities ? { cities: cloudCities } : null,
              error: null,
            };
          },
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

/*
 * The cold-start race. A device that already has a backup pulls the cloud row
 * on mount; an auto-push that lands first invalidates the pull's request
 * ticket and overwrites the cloud with whatever local state the app started
 * from. If localStorage had been cleared, that destroys the only copy.
 *
 * Two guards stand between those, and neither had a test — the fix was
 * verified by reading, which is exactly how the defect got in. Both are
 * driven here through the real effect and debounce plumbing.
 */
describe("useSavedLocationsSync on a cold start with an existing backup", () => {
  function persistAccount() {
    window.localStorage.setItem(
      SYNC_ACCOUNT_KEY,
      JSON.stringify({ syncKey: USER.id, createdAt: Date.now() })
    );
  }

  test("a failed restore does not push the local list over the cloud", async () => {
    /*
     * The destructive case: failing to READ the cloud must never be followed
     * by writing over it. A device whose localStorage was cleared would
     * otherwise replace a full backup with a near-empty list, and the failed
     * read is exactly when that list is least trustworthy.
     *
     * Note on what this does NOT prove. lastSyncedSignatureRef's seed (from
     * the mount-time list, where it was once "" — a value
     * getSavedCitiesSignature cannot return, making the "nothing changed"
     * short-circuit unreachable) is not observable here or anywhere else
     * through this hook. Mutating the seed back to "" leaves every test in
     * this file green. The push effect's deps are
     * [trackedPush, savedCities, savedCitiesSignature, syncAccount], and a
     * failed pull only moves syncState — so the effect never re-runs, the
     * gate is never re-consulted, and the seed never decides anything. It is
     * defence in depth behind the gate, not a load-bearing guard, and the
     * honest thing is to say so rather than to imply coverage this lacks.
     */
    persistAccount();
    const client = createFakeClient({
      selectError: { message: "network unreachable" },
    });
    const probe = renderProbe(client);

    await waitFor(() => assert.equal(client.calls.selects, 1), {
      timeout: PUSH_TIMEOUT_MS,
      interval: 25,
    });
    // Past the debounce, with the gate now open and the restore failed.
    await new Promise((resolve) => setTimeout(resolve, 1400));

    assert.equal(
      client.calls.upserts.length,
      0,
      "a failed restore must not overwrite the cloud with the local list"
    );
    assert.equal(probe.read().syncState.status, "error");
  });

  test("a successful restore on an unchanged list writes nothing", async () => {
    persistAccount();
    const client = createFakeClient({
      cloudCities: [buildCity(0), buildCity(1)],
    });
    const probe = renderProbe(client);

    await waitFor(() => assert.equal(client.calls.selects, 1), {
      timeout: PUSH_TIMEOUT_MS,
      interval: 25,
    });
    await new Promise((resolve) => setTimeout(resolve, 1400));

    assert.equal(client.calls.upserts.length, 0);
    assert.equal(probe.read().savedCities.length, 2, "the restore landed");
  });

  test("an edit made while the restore is in flight waits for it", async () => {
    // Guard two: initialPullSettledRef. The edit is a real change, so the
    // signature short-circuit does not apply and only the gate can hold the
    // push back.
    persistAccount();
    const client = createFakeClient({ cloudCities: [buildCity(0), buildCity(1)] });

    let releasePull;
    client.selectGate = new Promise((resolve) => {
      releasePull = resolve;
    });

    const probe = renderProbe(client);
    await probe.addCity(buildCity(9));

    // Past the debounce, with the restore still in flight.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    assert.equal(
      client.calls.upserts.length,
      0,
      "no push may land while the restore is still in flight"
    );

    await act(async () => {
      releasePull();
      await Promise.resolve();
    });

    // The restore itself does not push: it raises skipNextSyncPush and records
    // the merged signature as synced, so the cloud row is left alone and the
    // merge lands locally.
    await waitFor(
      () => assert.equal(probe.read().savedCities.length, 3),
      { timeout: PUSH_TIMEOUT_MS, interval: 25 }
    );
    const merged = probe.read().savedCities.map((city) => city.name);
    assert.ok(merged.includes("City 9"), "the local edit survived the merge");
    assert.ok(merged.includes("City 1"), "so did the cloud-only city");
    assert.equal(client.calls.upserts.length, 0);

    // The gate is not a permanent block: the next genuine change still pushes,
    // and carries everything the merge produced.
    await probe.addCity(buildCity(7));
    await probe.waitForUpserts(1);
    const pushed = cityNames(client.calls.upserts[0]);
    for (const name of ["City 0", "City 1", "City 9", "City 7"]) {
      assert.match(pushed, new RegExp(name), `${name} reached the cloud`);
    }
  });
});
