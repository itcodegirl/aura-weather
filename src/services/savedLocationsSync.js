// Saved-city cloud backup.
//
// This used to POST/PUT the user's saved cities to a public jsonblob.com
// blob: an unauthenticated URL that anyone holding it could read, including
// home and work coordinates. It now writes to `public.saved_cities` in
// Supabase, scoped to this device's anonymous auth user, with RLS as the
// boundary (supabase/migrations/0003_saved_cities.sql).
//
// Scope note: an anonymous session is per-browser, so this is a per-device
// BACKUP, not cross-device sync. The old paste-a-key flow is gone — there is
// no key to paste, because a second device is a different auth user and RLS
// will not show it these rows. Nothing here pretends otherwise.
//
// `pullSavedLocationsFromSync` / `pushSavedLocationsToSync` no longer take a
// syncKey. Under RLS the row is chosen by the session's JWT, so a syncKey
// parameter would be accepted and then ignored — a signature that lies about
// what it does. It was removed rather than kept as decoration.

import { parseCoordinates } from "../utils/weatherUnits.js";
import { MAX_SAVED_CITIES } from "../domain/savedCities.js";
import { getSupabaseClient, ensureSession } from "./supabaseClient.js";

const TABLE = "saved_cities";

const NOT_CONFIGURED_MESSAGE =
  "Cloud backup isn't available in this build. Your saved cities are still stored on this device.";
const NO_SESSION_MESSAGE =
  "Could not start a backup session for this device. Try again in a moment.";

function normalizeName(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeSavedCity(value) {
  const coordinates = parseCoordinates(value?.lat, value?.lon);
  if (!coordinates) {
    return null;
  }

  return {
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    name: normalizeName(value?.name, "Saved place"),
    country: normalizeName(value?.country, ""),
  };
}

function normalizeSavedCities(cities) {
  if (!Array.isArray(cities)) {
    return [];
  }

  const seen = new Set();
  return cities
    .map((city) => normalizeSavedCity(city))
    .filter(Boolean)
    .filter((city) => {
      const key = `${city.lat.toFixed(4)}:${city.lon.toFixed(4)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SAVED_CITIES);
}

function getErrorMessage(error, fallback) {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (
    error &&
    typeof error === "object" &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }
  return fallback;
}

// Resolves the client plus this device's anonymous user, or throws a message
// the panel can surface verbatim. `options.client` is a dependency-injection
// seam for tests; production callers pass nothing and get the real lazy client.
async function resolveBackupSession(options = {}) {
  const supabase = options.client ?? (await getSupabaseClient());
  if (!supabase) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  const user = await ensureSession(supabase);
  if (!user?.id) {
    throw new Error(NO_SESSION_MESSAGE);
  }

  return { supabase, user };
}

// The row is keyed by user_id. It is sent explicitly so the upsert has its
// conflict target, but it is not what makes this safe: the table's
// `with check ((select auth.uid()) = user_id)` policy rejects any row whose
// user_id is not the caller's own, and the column also defaults to auth.uid()
// for callers that omit it. A forged user_id is refused by the database.
async function writeSavedCities(supabase, userId, cities) {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      cities: normalizeSavedCities(cities),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(getErrorMessage(error, "Could not back up your saved cities."));
  }
}

/**
 * Starts backing this device up, seeding it with the cities already saved
 * locally. Returns `{ syncKey }` for the caller's persisted account record.
 *
 * `syncKey` is the anonymous user's id. It is a DISPLAY-ONLY marker meaning
 * "this device is backed up" — not a credential. It cannot be pasted into
 * another device, and knowing it grants nothing: RLS scopes every read and
 * write by the session's JWT, never by this string.
 */
export async function createSavedLocationsSyncAccount(initialSavedCities = [], options = {}) {
  const { supabase, user } = await resolveBackupSession(options);
  await writeSavedCities(supabase, user.id, initialSavedCities);
  return { syncKey: user.id };
}

/**
 * Reads this device's backed-up cities.
 *
 * Returns `[]` when the user has no row yet — the same "empty account is not
 * an error" contract the old HTTP 404 branch had, so the first backup on a
 * fresh device stays quiet instead of surfacing a failure.
 */
export async function pullSavedLocationsFromSync(options = {}) {
  const { supabase } = await resolveBackupSession(options);

  // No .eq("user_id", …): the select policy already restricts the result to
  // the caller's own row, and there is at most one.
  const { data, error } = await supabase.from(TABLE).select("cities").maybeSingle();

  if (error) {
    throw new Error(getErrorMessage(error, "Could not load your backed-up cities."));
  }

  return normalizeSavedCities(data?.cities);
}

/** Replaces this device's backed-up cities with `cities`. */
export async function pushSavedLocationsToSync(cities, options = {}) {
  const { supabase, user } = await resolveBackupSession(options);
  await writeSavedCities(supabase, user.id, cities);
}

/** Removes this device's backup row. Called when the user stops the backup. */
export async function deleteSavedLocationsBackup(options = {}) {
  const { supabase, user } = await resolveBackupSession(options);

  const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id);
  if (error) {
    // The panel shows this verbatim beneath its headline. The headline states
    // the outcome ("cloud copy remains"); this states the cause, using the
    // database's own words when it gave us any.
    throw new Error(
      getErrorMessage(error, "The cloud copy could not be removed.")
    );
  }
}

export function getSyncErrorMessage(error, fallback) {
  return getErrorMessage(error, fallback);
}
