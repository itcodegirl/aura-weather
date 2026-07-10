import { parseCoordinates } from "../utils/weatherUnits.js";
import { MAX_SAVED_CITIES, normalizeLocationName } from "./useLocation.js";

/**
 * Parses a stored sync-account string. Returns null when the value
 * is missing, malformed, or has no usable syncKey.
 */
export function deserializeSyncAccount(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const syncKey =
      typeof parsed.syncKey === "string" ? parsed.syncKey.trim() : "";
    if (!syncKey) {
      return null;
    }

    return { syncKey };
  } catch {
    return null;
  }
}

/**
 * Serializes a sync-account record into a string suitable for
 * persistence. Returns "" for nullish or malformed input.
 */
export function serializeSyncAccount(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return JSON.stringify({
    syncKey: typeof value.syncKey === "string" ? value.syncKey.trim() : "",
  });
}

/**
 * Produces a stable string fingerprint of a saved-cities array so
 * push effects can short-circuit when nothing meaningful changed.
 */
export function getSavedCitiesSignature(savedCities) {
  return JSON.stringify(
    (Array.isArray(savedCities) ? savedCities : []).map((city) => ({
      lat: city?.lat,
      lon: city?.lon,
      name: city?.name,
      country: city?.country,
    }))
  );
}

/**
 * Merges local and remote saved-city lists, deduping by lat/lon and
 * preferring the first occurrence (local entries win). Trims to the
 * maximum allowed and reports whether trimming occurred.
 */
export function mergeSavedCities(localCities, remoteCities) {
  const seen = new Set();
  const merged = [];
  const candidates = [
    ...(Array.isArray(localCities) ? localCities : []),
    ...(Array.isArray(remoteCities) ? remoteCities : []),
  ];

  for (const city of candidates) {
    const coordinates = parseCoordinates(city?.lat, city?.lon);
    if (!coordinates) {
      continue;
    }

    const key = `${coordinates.latitude.toFixed(4)}:${coordinates.longitude.toFixed(4)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    merged.push({
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      name: normalizeLocationName(city?.name, "Saved place"),
      country: normalizeLocationName(city?.country, ""),
    });
  }

  return {
    cities: merged.slice(0, MAX_SAVED_CITIES),
    wasTrimmed: merged.length > MAX_SAVED_CITIES,
  };
}

/**
 * Builds the user-facing message shown after a successful pull.
 */
export function formatPullSuccessMessage(
  remoteCities,
  savedCitiesCount,
  wasTrimmed
) {
  // This string lands in the always-visible status line under the "Cloud
  // Backup" title, so it must not say "synced": backup is per-device, and
  // "synced" would imply the cross-device behaviour that no longer exists.
  if (!Array.isArray(remoteCities) || remoteCities.length === 0) {
    return "Backed up";
  }

  const locationCount = Number.isFinite(savedCitiesCount)
    ? savedCitiesCount
    : remoteCities.length;
  const label = locationCount === 1 ? "location" : "locations";
  if (wasTrimmed) {
    return `Restored ${locationCount} saved ${label} (kept newest ${MAX_SAVED_CITIES})`;
  }

  return `Restored ${locationCount} saved ${label}`;
}

/**
 * Runs the "Stop backup" steps in the only order that leaves the cloud row
 * actually deleted. Extracted from the hook because the ordering — not the
 * React plumbing — is the part that must never regress, and because it is
 * only testable once it is separated from timers and effects.
 *
 * 1. `cancelPendingPush()` runs SYNCHRONOUSLY, before the first await. The
 *    auto-push debounce is a live timer; awaiting anything first gives it a
 *    window to elapse and upsert the row we are about to delete.
 * 2. `waitForInFlightPush()` drains a push already on the wire. Deleting
 *    first would let its upsert land afterwards and resurrect the row. A
 *    failed push is not a reason to refuse to stop the backup, so its
 *    rejection is swallowed.
 * 3. `deleteBackup()` runs last, and its rejection propagates: the caller
 *    decides how to report a delete that did not happen.
 */
export async function runStopBackupSequence({
  cancelPendingPush,
  waitForInFlightPush,
  deleteBackup,
}) {
  cancelPendingPush();

  try {
    await waitForInFlightPush();
  } catch {
    // Ignored on purpose — see above.
  }

  await deleteBackup();
}

/**
 * The sync state shown after "Stop backup", given whatever went wrong.
 *
 * The message is the panel's most prominent line, so it must not overstate
 * what happened. A plain "Backup stopped" is true only when the cloud row was
 * actually removed; if the delete failed, the row is still live and the
 * headline has to say so rather than leaving that fact to the error text
 * underneath it. Extracted from the hook so both branches are tested.
 */
export function buildStopBackupState(deleteError) {
  if (deleteError) {
    return {
      status: "error",
      message: "Backup stopped, cloud copy remains",
      error: deleteError,
      lastSyncedAt: null,
    };
  }

  return {
    status: "idle",
    message: "Backup stopped",
    error: null,
    lastSyncedAt: null,
  };
}
