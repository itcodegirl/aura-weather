import { parseCoordinates } from "../utils/weatherUnits";
import { MAX_SAVED_CITIES } from "../hooks/useLocation";

const DEFAULT_SYNC_CREATE_ENDPOINT = "https://jsonblob.com/api/jsonBlob";

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

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(value ?? "");
}

function getConfiguredSyncBase() {
  const configured =
    typeof import.meta !== "undefined" &&
    import.meta &&
    import.meta.env &&
    typeof import.meta.env.VITE_AURA_SYNC_API_BASE === "string"
      ? import.meta.env.VITE_AURA_SYNC_API_BASE.trim()
      : "";
  return configured.replace(/\/+$/, "");
}

function resolveSyncUrl(syncKey) {
  const normalizedKey = normalizeName(syncKey);
  if (!normalizedKey) return null;
  if (isAbsoluteHttpUrl(normalizedKey)) return normalizedKey;

  const configuredBase = getConfiguredSyncBase();
  if (!configuredBase) return null;

  return `${configuredBase}/${encodeURIComponent(normalizedKey)}`;
}

async function parseJsonOrNull(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
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

export async function createSavedLocationsSyncAccount(initialSavedCities = [], options = {}) {
  const payload = {
    savedCities: normalizeSavedCities(initialSavedCities),
    updatedAt: new Date().toISOString(),
  };
  const configuredBase = getConfiguredSyncBase();
  const endpoint = configuredBase || DEFAULT_SYNC_CREATE_ENDPOINT;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Could not create sync account (${response.status})`);
  }

  const locationHeader = response.headers.get("Location");
  const syncKey = normalizeName(locationHeader);
  if (!syncKey) {
    throw new Error("Sync account created, but no account key was returned.");
  }

  return {
    syncKey,
  };
}

export async function pullSavedLocationsFromSync(syncKey, options = {}) {
  const url = resolveSyncUrl(syncKey);
  if (!url) {
    throw new Error(
      "Sync key is invalid. Provide a full sync URL or configure VITE_AURA_SYNC_API_BASE."
    );
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Could not load synced locations (${response.status})`);
  }

  const payload = await parseJsonOrNull(response);
  const savedCities = normalizeSavedCities(payload?.savedCities);
  return savedCities;
}

export async function pushSavedLocationsToSync(syncKey, cities, options = {}) {
  const url = resolveSyncUrl(syncKey);
  if (!url) {
    throw new Error(
      "Sync key is invalid. Provide a full sync URL or configure VITE_AURA_SYNC_API_BASE."
    );
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      savedCities: normalizeSavedCities(cities),
      updatedAt: new Date().toISOString(),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await parseJsonOrNull(response);
    const message =
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : `Could not sync locations (${response.status})`;
    throw new Error(message);
  }
}

export function getSyncErrorMessage(error, fallback) {
  return getErrorMessage(error, fallback);
}

