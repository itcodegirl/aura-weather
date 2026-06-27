// Lazy Supabase client for the rain-alerts feature. @supabase/supabase-js is
// dynamically imported only when alerts are actually used, so users who never
// open alerts don't pay for it in the main bundle.

// `import.meta.env` is a Vite build-time object; guard so importing this
// module in a plain Node/test context (where it's undefined) never throws.
const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

let clientPromise = null;

// True only when the build was given the Supabase env vars. When false, the
// whole alerts feature degrades to "not configured" rather than erroring.
export function isAlertsConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabaseClient() {
  if (!isAlertsConfigured()) {
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
