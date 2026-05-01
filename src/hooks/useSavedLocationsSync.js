import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { parseCoordinates } from "../utils/weatherUnits";
import {
  MAX_SAVED_CITIES,
  replaceSavedCities,
  normalizeLocationName,
} from "./useLocation";
import { useLocalStorageState } from "./useLocalStorageState";
import {
  createSavedLocationsSyncAccount,
  pullSavedLocationsFromSync,
  pushSavedLocationsToSync,
  getSyncErrorMessage,
} from "../services/savedLocationsSync";

const SYNC_ACCOUNT_KEY = "aura-weather-sync-account-v1";

function deserializeSyncAccount(rawValue) {
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

function serializeSyncAccount(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return JSON.stringify({
    syncKey: typeof value.syncKey === "string" ? value.syncKey.trim() : "",
  });
}

function getSavedCitiesSignature(savedCities) {
  return JSON.stringify(
    (Array.isArray(savedCities) ? savedCities : []).map((city) => ({
      lat: city?.lat,
      lon: city?.lon,
      name: city?.name,
      country: city?.country,
    }))
  );
}

function mergeSavedCities(localCities, remoteCities) {
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

function formatPullSuccessMessage(remoteCities, savedCitiesCount, wasTrimmed) {
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

export function useSavedLocationsSync(savedCities, setSavedCities) {
  const [syncAccount, setSyncAccount] = useLocalStorageState(
    SYNC_ACCOUNT_KEY,
    null,
    {
      deserialize: deserializeSyncAccount,
      serialize: serializeSyncAccount,
    }
  );
  const [syncState, setSyncState] = useState({
    status: "idle",
    message: "",
    error: null,
    lastSyncedAt: null,
  });
  const savedCitiesRef = useRef(savedCities);
  const syncRequestRef = useRef(0);
  const skipNextSyncPushRef = useRef(false);
  const skipNextAutoPullRef = useRef(false);
  const lastSyncedSignatureRef = useRef("");

  useEffect(() => {
    savedCitiesRef.current = savedCities;
  }, [savedCities]);

  const syncConnected = Boolean(syncAccount?.syncKey);
  const savedCitiesSignature = useMemo(
    () => getSavedCitiesSignature(savedCities),
    [savedCities]
  );

  const pullFromSyncAccount = useCallback(async (accountToUse, options = {}) => {
    if (!accountToUse?.syncKey) {
      return null;
    }

    const requestId = syncRequestRef.current + 1;
    syncRequestRef.current = requestId;

    setSyncState((previousState) => ({
      ...previousState,
      status: "syncing",
      message: options.initial ? "Connecting to sync account..." : "Syncing locations...",
      error: null,
    }));

    try {
      const remoteCities = await pullSavedLocationsFromSync(accountToUse.syncKey);
      if (requestId !== syncRequestRef.current) {
        return [];
      }

      const { cities: mergedCities, wasTrimmed } = mergeSavedCities(
        savedCitiesRef.current,
        remoteCities
      );
      skipNextSyncPushRef.current = true;
      const normalizedLocal = replaceSavedCities(mergedCities);
      setSavedCities(normalizedLocal);
      lastSyncedSignatureRef.current = getSavedCitiesSignature(normalizedLocal);

      setSyncState((previousState) => ({
        ...previousState,
        status: "ready",
        message: formatPullSuccessMessage(
          remoteCities,
          normalizedLocal.length,
          wasTrimmed
        ),
        error: null,
        lastSyncedAt: Date.now(),
      }));

      return normalizedLocal;
    } catch (syncError) {
      if (requestId !== syncRequestRef.current) {
        return [];
      }

      setSyncState((previousState) => ({
        ...previousState,
        status: "error",
        message: "Sync failed",
        error: getSyncErrorMessage(syncError, "Could not sync saved locations."),
      }));

      return null;
    }
  }, [setSavedCities]);

  const pushToSyncAccount = useCallback(async (accountToUse, citiesToSync, options = {}) => {
    if (!accountToUse?.syncKey) {
      return;
    }

    const requestId = syncRequestRef.current + 1;
    syncRequestRef.current = requestId;

    setSyncState((previousState) => ({
      ...previousState,
      status: "syncing",
      message: options.auto ? "Syncing changes..." : "Syncing now...",
      error: null,
    }));

    try {
      await pushSavedLocationsToSync(accountToUse.syncKey, citiesToSync);
      if (requestId !== syncRequestRef.current) {
        return;
      }

      lastSyncedSignatureRef.current = getSavedCitiesSignature(citiesToSync);

      setSyncState((previousState) => ({
        ...previousState,
        status: "ready",
        message: "Sync complete",
        error: null,
        lastSyncedAt: Date.now(),
      }));
    } catch (syncError) {
      if (requestId !== syncRequestRef.current) {
        return;
      }

      setSyncState((previousState) => ({
        ...previousState,
        status: "error",
        message: "Sync failed",
        error: getSyncErrorMessage(syncError, "Could not push saved locations."),
      }));
    }
  }, []);

  const createSyncAccount = useCallback(async () => {
    setSyncState((previousState) => ({
      ...previousState,
      status: "syncing",
      message: "Creating sync account...",
      error: null,
    }));

    try {
      const created = await createSavedLocationsSyncAccount(savedCities);
      const nextAccount = { syncKey: created.syncKey };
      skipNextAutoPullRef.current = true;
      setSyncAccount(nextAccount);
      lastSyncedSignatureRef.current = savedCitiesSignature;
      setSyncState({
        status: "ready",
        message: "Sync account created",
        error: null,
        lastSyncedAt: Date.now(),
      });
    } catch (syncError) {
      setSyncState((previousState) => ({
        ...previousState,
        status: "error",
        message: "Could not create sync account",
        error: getSyncErrorMessage(syncError, "Try again in a moment."),
      }));
    }
  }, [savedCities, savedCitiesSignature, setSyncAccount]);

  const connectSyncAccount = useCallback(async (syncKey) => {
    const normalizedSyncKey = typeof syncKey === "string" ? syncKey.trim() : "";
    if (!normalizedSyncKey) {
      setSyncState((previousState) => ({
        ...previousState,
        status: "error",
        message: "Sync key required",
        error: "Paste your sync key or URL to connect.",
      }));
      return;
    }

    const nextAccount = { syncKey: normalizedSyncKey };
    const connectedCities = await pullFromSyncAccount(nextAccount, { initial: true });
    if (connectedCities === null) {
      return;
    }

    skipNextAutoPullRef.current = true;
    setSyncAccount(nextAccount);
  }, [pullFromSyncAccount, setSyncAccount]);

  const disconnectSyncAccount = useCallback(() => {
    syncRequestRef.current += 1;
    setSyncAccount(null);
    setSyncState({
      status: "idle",
      message: "Sync disconnected",
      error: null,
      lastSyncedAt: null,
    });
  }, [setSyncAccount]);

  const syncSavedCitiesNow = useCallback(async () => {
    if (!syncAccount?.syncKey) {
      return;
    }

    await pushToSyncAccount(syncAccount, savedCities, { auto: false });
  }, [pushToSyncAccount, savedCities, syncAccount]);

  useEffect(() => {
    if (!syncAccount?.syncKey) {
      return;
    }

    if (skipNextAutoPullRef.current) {
      skipNextAutoPullRef.current = false;
      return;
    }

    Promise.resolve().then(() => {
      void pullFromSyncAccount(syncAccount, { initial: true });
    });
  }, [pullFromSyncAccount, syncAccount]);

  useEffect(() => {
    if (!syncAccount?.syncKey) {
      return;
    }

    if (skipNextSyncPushRef.current) {
      skipNextSyncPushRef.current = false;
      return;
    }

    if (savedCitiesSignature === lastSyncedSignatureRef.current) {
      return;
    }

    const timerId = setTimeout(() => {
      void pushToSyncAccount(syncAccount, savedCities, { auto: true });
    }, 900);

    return () => {
      clearTimeout(timerId);
    };
  }, [pushToSyncAccount, savedCities, savedCitiesSignature, syncAccount]);

  return {
    syncConnected,
    syncAccount,
    syncState,
    createSyncAccount,
    connectSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
  };
}
