import { parseCoordinates } from "../utils/weatherUnits.js";
import {
  normalizeLocationName,
  DEFAULT_LOCATION,
  LOCATION_FALLBACK_NOTICE,
  SAVED_LOCATION_NOTICE,
} from "./useLocation.js";

/**
 * Builds a normalized location payload (lat/lon validated, name/country
 * trimmed) suitable for storage and equality comparison. Returns null
 * when the coordinates are missing or out of range.
 */
export function toLocationPayload(lat, lon, name = "", country = "") {
  const coordinates = parseCoordinates(lat, lon);
  if (!coordinates) {
    return null;
  }

  return {
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    name: normalizeLocationName(name, ""),
    country: normalizeLocationName(country, ""),
  };
}

/**
 * Returns true when both inputs parse to identical lat/lon. Used to
 * decide whether removing a saved city should also clear the
 * startup-location persistence.
 */
export function hasMatchingCoordinates(firstLocation, secondLocation) {
  const firstCoordinates = parseCoordinates(firstLocation?.lat, firstLocation?.lon);
  const secondCoordinates = parseCoordinates(
    secondLocation?.lat,
    secondLocation?.lon
  );

  if (!firstCoordinates || !secondCoordinates) {
    return false;
  }

  return (
    firstCoordinates.latitude === secondCoordinates.latitude &&
    firstCoordinates.longitude === secondCoordinates.longitude
  );
}

/**
 * Chooses the location to show on a cold load, in priority order:
 *
 *   1. A valid ?lat&lon[&name&country] deep link — a shared or
 *      bookmarked forecast. It becomes the active view but does NOT
 *      overwrite the user's own startup city, and is not auto-persisted.
 *      If the link happens to match the user's startup city, it is
 *      treated as a normal saved-location open (same notice/state).
 *   2. The user's persisted startup location.
 *   3. The built-in default, with the location-setup prompt.
 *
 * Kept pure (inputs in, plain state out) so the precedence is unit
 * tested without standing up the whole useWeather hook.
 */
export function resolveInitialLocationState({
  urlLocation = null,
  persistedLocation = null,
} = {}) {
  if (urlLocation) {
    const matchesStartup =
      persistedLocation && hasMatchingCoordinates(urlLocation, persistedLocation);
    if (matchesStartup) {
      return {
        location: persistedLocation,
        startupLocation: persistedLocation,
        notice: SAVED_LOCATION_NOTICE,
        hasPersistedLocation: true,
      };
    }

    return {
      location: urlLocation,
      startupLocation: persistedLocation ?? null,
      notice: null,
      hasPersistedLocation: Boolean(persistedLocation),
    };
  }

  if (persistedLocation) {
    return {
      location: persistedLocation,
      startupLocation: persistedLocation,
      notice: SAVED_LOCATION_NOTICE,
      hasPersistedLocation: true,
    };
  }

  return {
    location: DEFAULT_LOCATION,
    startupLocation: null,
    notice: LOCATION_FALLBACK_NOTICE,
    hasPersistedLocation: false,
  };
}
