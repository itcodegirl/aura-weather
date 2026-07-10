// Lazy Supabase client. @supabase/supabase-js is dynamically imported only
// when a feature that needs it is actually used (rain alerts, saved-city
// backup), so users who touch neither don't pay for it in the main bundle.

// `import.meta.env` is a Vite build-time object; guard so importing this
// module in a plain Node/test context (where it's undefined) never throws.
const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

let clientPromise = null;

// True only when the build was given the Supabase env vars. When false, the
// features that depend on it degrade to "not configured" rather than erroring.
export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

// Historical name, kept because the alerts code and its tests import it.
export function isAlertsConfigured() {
  return isSupabaseConfigured();
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return Promise.resolve(null);
  }
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    );
  }
  return clientPromise;
}

/**
 * The device's anonymous Supabase session — created once, then reused.
 *
 * `persistSession: true` (above) keeps the session in localStorage, so a
 * returning visitor on the same browser resolves to the SAME `auth.users`
 * row and sees their own rows again. Clearing site data discards the
 * session, and the next visit mints a brand-new anonymous user with no way
 * back to the old one's rows — by design: an anonymous identity is a
 * browser, not a person.
 *
 * Shared by rain alerts and saved-city backup so a device has one identity
 * across both, and so it stays upgradeable to a real sign-in later without
 * orphaning either feature's rows.
 *
 * `client` is injectable so tests can drive this without a network or a
 * configured build; production callers pass nothing.
 */
export async function ensureSession(client) {
  const supabase = client ?? (await getSupabaseClient());
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}
