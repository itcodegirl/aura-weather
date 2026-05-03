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
  if (!Array.isArray(remoteCities) || remoteCities.length === 0) {
    return "Sync connected";
  }

  const locationCount = Number.isFinite(savedCitiesCount)
    ? savedCitiesCount
    : remoteCities.length;
  const label = locationCount === 1 ? "location" : "locations";
  if (wasTrimmed) {
    return `Synced ${locationCount} saved ${label} (kept newest ${MAX_SAVED_CITIES})`;
  }

  return `Synced ${locationCount} saved ${label}`;
}
