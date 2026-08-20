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

/**
 * True when this browser already holds a persisted Supabase session, decided
 * WITHOUT importing the client.
 *
 * Reads that need a user resolve to "nothing" when there is no session —
 * getSessionUser returns null and the caller returns an empty list. Answering
 * that required a dynamic import of @supabase/supabase-js (201 KB) purely to
 * be told there is nobody to ask about. Anonymous sessions are per-browser by
 * design (see ensureSession), so "no stored session" means "this browser owns
 * no rows", never "the rows live on another device".
 *
 * supabase-js persists under the default `sb-<project-ref>-auth-token` key, so
 * the presence check is a localStorage scan. Deliberately conservative: any
 * uncertainty (no window, no localStorage, an access throw) returns true so
 * the caller falls through to the real, authoritative session check rather
 * than wrongly reporting "no rows".
 */
export function hasStoredSession() {
  if (!isSupabaseConfigured()) {
    return false;
  }
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return true;
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
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

  const existing = await getSessionUser(supabase);
  if (existing) return existing;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

/**
 * This device's user if it already has a session, otherwise null. Never signs
 * anyone in.
 *
 * Reads must use this rather than {@link ensureSession}. A visitor who has
 * never enabled alerts or started a backup owns no rows, and asking "what are
 * my rows?" should not conjure an identity in order to answer "none". Doing so
 * minted an `auth.users` row for every visitor, which is how the project came
 * to hold dozens of anonymous users against a handful of alert rules.
 *
 * An identity is created only when the user asks for something that persists.
 */
export async function getSessionUser(client) {
  const supabase = client ?? (await getSupabaseClient());
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
