#!/usr/bin/env node
//
// Proves that row-level security isolates one anonymous visitor's saved cities
// from another's, against a real Supabase project.
//
// Why this is a script and not a unit test: RLS is a Postgres guarantee, not
// application logic. `npm test` is bare `node --test` with no network, and CI
// injects no Supabase credentials, so nothing in the automated gate can
// exercise a policy. A mocked client would only assert against the mock. This
// runs the real REST path the app uses, with two real anonymous sessions.
//
// It is therefore a MANUAL, pre-release check — see "Cloud backup — RLS
// isolation" in docs/qa-checklist.md. Run it after any change to
// public.saved_cities or its policies.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<publishable key> \
//   node supabase/tests/saved-cities-rls.mjs
//
// Exits 0 when every check passes, 1 otherwise.
//
// Side effect: creates two anonymous auth users. It deletes the rows they
// wrote, but it cannot delete the users themselves — that needs the service
// role key, which deliberately does not live on a developer's machine. Set
// SUPABASE_SERVICE_ROLE_KEY to have them cleaned up too.

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !ANON_KEY) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_ANON_KEY (both are in .env.example for this project)."
  );
  process.exit(1);
}

const TABLE = "saved_cities";
const results = [];

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signInAnonymously(label) {
  const response = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(
      `Anonymous sign-in failed for ${label} (HTTP ${response.status}). ` +
        `Is "Allow anonymous sign-ins" enabled on this project? ${JSON.stringify(body)}`
    );
  }
  console.log(`  ${label} = ${body.user.id} (is_anonymous=${body.user.is_anonymous})`);
  return { token: body.access_token, id: body.user.id };
}

// `token` omitted => the pre-sign-in `anon` role, i.e. the publishable key alone.
function rest(token, path, init = {}) {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

const rowCount = async (response) => {
  const body = await response.json();
  return Array.isArray(body) ? body.length : null;
};

console.log(`\nRLS isolation — ${TABLE} @ ${URL_BASE}\n`);
console.log("Two independent anonymous sessions:");
const a = await signInAnonymously("A");
const b = await signInAnonymously("B");

console.log("\nA writes a city (user_id omitted — the column defaults to auth.uid()):");
let response = await rest(a.token, TABLE, {
  method: "POST",
  body: JSON.stringify({
    cities: [{ lat: 51.5072, lon: -0.1276, name: "London", country: "United Kingdom" }],
  }),
});
const inserted = (await response.json())?.[0];
check(
  "A can insert its own row",
  response.status === 201 && inserted?.user_id === a.id,
  `HTTP ${response.status}, user_id=${inserted?.user_id ?? "none"}`
);
check(
  "the row is stamped with A's auth.uid(), not client input",
  inserted?.user_id === a.id
);

console.log("\nA reads its own row:");
response = await rest(a.token, `${TABLE}?select=cities`);
check("A can read its own row", (await rowCount(response)) === 1);

console.log("\nB (a different anonymous user) attacks A's row:");
response = await rest(b.token, `${TABLE}?select=*`);
check("B reads zero rows", (await rowCount(response)) === 0);

response = await rest(b.token, `${TABLE}?user_id=eq.${a.id}`, {
  method: "PATCH",
  body: JSON.stringify({ cities: [] }),
});
check("B updates zero rows", (await rowCount(response)) === 0);

response = await rest(b.token, `${TABLE}?user_id=eq.${a.id}`, { method: "DELETE" });
check("B deletes zero rows", (await rowCount(response)) === 0);

response = await rest(b.token, TABLE, {
  method: "POST",
  body: JSON.stringify({ user_id: a.id, cities: [{ lat: 0, lon: 0, name: "Forged" }] }),
});
const forgeBody = await response.text();
check(
  "B cannot forge a row owned by A (with check)",
  response.status === 403 && /row-level security policy/.test(forgeBody),
  `HTTP ${response.status}`
);

console.log("\nThe publishable key with no session (the `anon` role):");
response = await rest(null, `${TABLE}?select=*`);
const anonRows = await rowCount(response);
check(
  "no public read",
  anonRows === 0 || response.status >= 400,
  `HTTP ${response.status}, rows=${anonRows}`
);

response = await rest(null, TABLE, {
  method: "POST",
  body: JSON.stringify({ cities: [] }),
});
check("no public write", response.status >= 400, `HTTP ${response.status}`);

console.log("\nA's row survived every attack:");
response = await rest(a.token, `${TABLE}?select=cities`);
const survivors = await response.json();
check(
  "A's cities are intact",
  survivors?.[0]?.cities?.[0]?.name === "London",
  JSON.stringify(survivors?.[0]?.cities ?? null)
);

console.log("\nCleaning up:");
for (const user of [a, b]) {
  await rest(user.token, `${TABLE}?user_id=eq.${user.id}`, { method: "DELETE" });
}
response = await rest(a.token, `${TABLE}?select=cities`);
check("test rows removed", (await rowCount(response)) === 0);

if (SERVICE_KEY) {
  for (const user of [a, b]) {
    await fetch(`${URL_BASE}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  }
  console.log("  anonymous test users deleted");
} else {
  console.log(
    `  NOTE: anonymous users ${a.id} and ${b.id} remain.\n` +
      "  Set SUPABASE_SERVICE_ROLE_KEY to delete them, or remove them from the dashboard."
  );
}

const failed = results.filter((result) => !result.passed);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed.` +
    (failed.length ? ` FAILED: ${failed.map((f) => f.name).join(", ")}` : "")
);
process.exit(failed.length ? 1 : 0);
