import { parseCoordinates } from "../utils/weatherUnits.js";
import { normalizeLocationName } from "./useLocation.js";

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
