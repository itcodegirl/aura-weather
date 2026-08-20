// A read must never create an identity.
//
// listRules() runs on every dashboard mount. It used to call ensureSession(),
// so a visitor who had never enabled alerts was signed in anonymously purely to
// be told they had no rules — one auth.users row per visitor. These tests pin
// the distinction between the two accessors so it cannot quietly regress.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ensureSession, getSessionUser } from "./supabaseClient.js";

const USER = { id: "22222222-2222-4222-8222-222222222222" };

function createFakeClient({ session = null } = {}) {
  const calls = { getSession: 0, signInAnonymously: 0 };

  return {
    calls,
    auth: {
      getSession: async () => {
        calls.getSession += 1;
        return { data: { session } };
      },
      signInAnonymously: async () => {
        calls.signInAnonymously += 1;
        return { data: { user: USER }, error: null };
      },
    },
  };
}

describe("getSessionUser", () => {
  test("returns null and signs nobody in when there is no session", async () => {
    const client = createFakeClient({ session: null });

    assert.equal(await getSessionUser(client), null);
    assert.equal(
      client.calls.signInAnonymously,
      0,
      "a read must not mint an anonymous user"
    );
  });

  test("returns the existing user without signing in again", async () => {
    const client = createFakeClient({ session: { user: USER } });

    assert.equal((await getSessionUser(client)).id, USER.id);
    assert.equal(client.calls.signInAnonymously, 0);
  });

  test("returns null when Supabase is not configured", async () => {
    // No injected client, and no Vite env under `node --test`.
    assert.equal(await getSessionUser(), null);
  });
});

describe("ensureSession", () => {
  test("creates an anonymous user only when none exists", async () => {
    const client = createFakeClient({ session: null });

    assert.equal((await ensureSession(client)).id, USER.id);
    assert.equal(client.calls.signInAnonymously, 1);
  });

  test("reuses an existing session rather than minting a second identity", async () => {
    const client = createFakeClient({ session: { user: USER } });

    assert.equal((await ensureSession(client)).id, USER.id);
    assert.equal(client.calls.signInAnonymously, 0);
  });

  test("returns null when Supabase is not configured", async () => {
    assert.equal(await ensureSession(), null);
  });
});

// A read must not download a database client to report an empty list.
//
// listRules() runs on every dashboard mount. Even after it stopped creating
// identities, it still dynamically imported @supabase/supabase-js (201 KB)
// just to learn there was no session and return []. hasStoredSession() answers
// that from localStorage instead. It must be conservative: any uncertainty has
// to report "maybe", so the caller falls through to the real check rather than
// wrongly claiming the browser owns no rows.

describe("hasStoredSession", () => {
  const originalWindow = globalThis.window;

  function withLocalStorage(keys) {
    globalThis.window = {
      localStorage: {
        length: keys.length,
        key: (i) => keys[i] ?? null,
      },
    };
  }

  function restore() {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  test("reports no session when localStorage holds no supabase auth key", async () => {
    const { hasStoredSession } = await import("./supabaseClient.js");
    withLocalStorage(["aura-weather-saved-cities", "theme"]);
    try {
      // Unconfigured builds report false regardless; configured builds with no
      // auth key must also report false so the import can be skipped.
      assert.equal(hasStoredSession(), false);
    } finally {
      restore();
    }
  });

  test("errs toward 'maybe' when there is no window to inspect", async () => {
    const { hasStoredSession, isSupabaseConfigured } = await import(
      "./supabaseClient.js"
    );
    delete globalThis.window;
    try {
      // Unconfigured: false is correct and cheap. Configured: must not claim
      // "no rows" from an environment it cannot inspect.
      const expected = isSupabaseConfigured() ? true : false;
      assert.equal(hasStoredSession(), expected);
    } finally {
      restore();
    }
  });
});
