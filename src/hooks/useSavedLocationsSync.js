import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { replaceSavedCities } from "./useLocation";
import { useLocalStorageState } from "./useLocalStorageState";
import {
  createSavedLocationsSyncAccount,
  pullSavedLocationsFromSync,
  pushSavedLocationsToSync,
  deleteSavedLocationsBackup,
  getSyncErrorMessage,
} from "../services/savedLocationsSync";
import {
  deserializeSyncAccount,
  formatPullSuccessMessage,
  getSavedCitiesSignature,
  mergeSavedCities,
  runStopBackupSequence,
  serializeSyncAccount,
} from "./savedLocationsSyncHelpers";

/*
 * v2 because every v1 record holds a jsonblob.com URL as its syncKey. Backup
 * now resolves the row from the Supabase session's JWT, so a stale jsonblob
 * URL means nothing — but a leftover v1 record would still read as
 * "connected" and drive the backup effects. Bumping the key retires those
 * records and asks the user to opt in again. Saved cities themselves live
 * under a different key (aura-weather-saved-cities) and are untouched.
 */
const SYNC_ACCOUNT_KEY = "aura-weather-sync-account-v2";
const AUTO_PUSH_DEBOUNCE_MS = 900;

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
  /*
   * Stopping the backup has to beat the auto-push debounce to the database.
   * `syncRequestRef` only gates whether a completed request is allowed to
   * write state — it cannot cancel a timer or an in-flight upsert. So we
   * track both directly: the pending debounce timer, and the promise of any
   * push already on the wire. Without these, a push armed moments before
   * "Stop backup" lands after the delete and silently recreates the row.
   */
  const autoPushTimerRef = useRef(null);
  const inFlightPushRef = useRef(null);

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
      message: options.initial ? "Restoring your backup..." : "Backing up...",
      error: null,
    }));

    try {
      const remoteCities = await pullSavedLocationsFromSync();
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
        message: "Backup failed",
        error: getSyncErrorMessage(syncError, "Could not restore your backup."),
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
      message: options.auto ? "Backing up changes..." : "Backing up now...",
      error: null,
    }));

    try {
      await pushSavedLocationsToSync(citiesToSync);
      if (requestId !== syncRequestRef.current) {
        return;
      }

      lastSyncedSignatureRef.current = getSavedCitiesSignature(citiesToSync);

      setSyncState((previousState) => ({
        ...previousState,
        status: "ready",
        message: "Backed up",
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
        message: "Backup failed",
        error: getSyncErrorMessage(
          syncError,
          "Could not back up your saved cities."
        ),
      }));
    }
  }, []);

  // Every push goes through here so `disconnectSyncAccount` can await one
  // that is already on the wire before it issues the delete.
  const trackedPush = useCallback(
    (accountToUse, citiesToSync, options) => {
      const pushPromise = pushToSyncAccount(accountToUse, citiesToSync, options);
      inFlightPushRef.current = pushPromise;
      void pushPromise.finally(() => {
        if (inFlightPushRef.current === pushPromise) {
          inFlightPushRef.current = null;
        }
      });
      return pushPromise;
    },
    [pushToSyncAccount]
  );

  const createSyncAccount = useCallback(async () => {
    setSyncState((previousState) => ({
      ...previousState,
      status: "syncing",
      message: "Starting backup...",
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
        message: "Backed up",
        error: null,
        lastSyncedAt: Date.now(),
      });
    } catch (syncError) {
      setSyncState((previousState) => ({
        ...previousState,
        status: "error",
        message: "Could not start backup",
        error: getSyncErrorMessage(syncError, "Try again in a moment."),
      }));
    }
  }, [savedCities, savedCitiesSignature, setSyncAccount]);

  /*
   * Stopping the backup deletes the cloud row, not just the local record —
   * "Stop backup" should mean the cloud copy is gone. The user's cities live
   * in localStorage regardless, so nothing they can see is lost.
   *
   * If the delete fails we still disconnect locally: stranding the user in a
   * backed-up state they asked to leave is worse than an orphaned row only
   * they can read. The failure is surfaced, not swallowed.
   */
  const disconnectSyncAccount = useCallback(async () => {
    syncRequestRef.current += 1;

    // The ordering contract lives in runStopBackupSequence, which is where it
    // is tested. Get it wrong and "Stop backup" reports success while the
    // user's coordinates are still in the cloud.
    let deleteError = null;
    try {
      await runStopBackupSequence({
        cancelPendingPush: () => {
          if (autoPushTimerRef.current !== null) {
            clearTimeout(autoPushTimerRef.current);
            autoPushTimerRef.current = null;
          }
          // Stop the re-render that follows from arming a fresh timer
          // against the account we are about to drop.
          skipNextSyncPushRef.current = true;
        },
        waitForInFlightPush: () => inFlightPushRef.current,
        deleteBackup: () => deleteSavedLocationsBackup(),
      });
    } catch (syncError) {
      deleteError = getSyncErrorMessage(
        syncError,
        "Backup stopped on this device, but the cloud copy could not be removed."
      );
    }

    setSyncAccount(null);
    setSyncState({
      status: deleteError ? "error" : "idle",
      message: "Backup stopped",
      error: deleteError,
      lastSyncedAt: null,
    });
  }, [setSyncAccount]);

  const syncSavedCitiesNow = useCallback(async () => {
    if (!syncAccount?.syncKey) {
      return;
    }

    await trackedPush(syncAccount, savedCities, { auto: false });
  }, [trackedPush, savedCities, syncAccount]);

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
      autoPushTimerRef.current = null;
      void trackedPush(syncAccount, savedCities, { auto: true });
    }, AUTO_PUSH_DEBOUNCE_MS);
    autoPushTimerRef.current = timerId;

    return () => {
      clearTimeout(timerId);
      if (autoPushTimerRef.current === timerId) {
        autoPushTimerRef.current = null;
      }
    };
  }, [trackedPush, savedCities, savedCitiesSignature, syncAccount]);

  return {
    syncConnected,
    syncAccount,
    syncState,
    createSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
  };
}
