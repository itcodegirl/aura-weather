import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALERT_TYPES,
  isAlertsAvailable,
  getPermission,
  getExistingSubscription,
  enablePush,
  disablePush,
  listRules,
  addRule,
  removeRule,
  sendTestNotification,
} from "../services/pushAlerts.js";
import {
  createAlertRequestTracker,
  sameLocation,
} from "./rainAlertHelpers.js";

// The real push-alerts service. `options.service` injects a fake in render
// tests — the same dependency-injection seam savedLocationsSync.js uses for
// its Supabase client — because availability is decided by build-time env
// vars a test cannot set. The object must stay stable across renders: the
// load effect keys on it.
const ALERTS_SERVICE = {
  isAlertsAvailable,
  getPermission,
  getExistingSubscription,
  enablePush,
  disablePush,
  listRules,
  addRule,
  removeRule,
  sendTestNotification,
};

// An aborted load is a superseded load, not a failure: the user moved on
// before it finished, so it must not surface an error to them. Supabase
// rejects with a DOMException-shaped AbortError; the signal check covers
// clients that reject with something plainer.
function isAbortError(caught, signal) {
  return caught?.name === "AbortError" || Boolean(signal?.aborted);
}

function ruleLocation(location) {
  return {
    lat: location.lat,
    lon: location.lon,
    name: location.name,
    timezone: location.timezone,
  };
}

/**
 * Orchestrates the rain-alerts UI for the active location: tracks whether
 * push is available/permitted, which alert types are on for this place, and
 * exposes the enable/disable/toggle/test actions. Everything degrades quietly
 * when alerts are unconfigured or unsupported.
 */
export function useRainAlerts(location, options = {}) {
  const service = options.service ?? ALERTS_SERVICE;
  const available = service.isAlertsAvailable();
  const [permission, setPermission] = useState(() => service.getPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [activeTypes, setActiveTypes] = useState({}); // type -> rule id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testSent, setTestSent] = useState(false);
  const mountedRef = useRef(true);
  const trackerRef = useRef(null);
  if (trackerRef.current === null) {
    trackerRef.current = createAlertRequestTracker();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Coordinates, not the location object: which rules match is decided by
  // coordinates alone (sameLocation compares nothing else), and the
  // geolocation path emits a second location with identical coordinates once
  // reverse geocoding names the place. Keying on object identity re-ran the
  // whole rule query for that rename.
  const hasLocation = Boolean(location);
  const locationLat = location?.lat;
  const locationLon = location?.lon;

  // Pure fetch — returns the subscription/rule state for this location
  // without touching React state, so callers control when setState runs.
  const loadAlertState = useCallback(async (signal) => {
    if (!available || !hasLocation) return null;
    const [subscription, rules] = await Promise.all([
      service.getExistingSubscription(),
      service.listRules({ signal }),
    ]);
    const map = {};
    const coordinates = { lat: locationLat, lon: locationLon };
    for (const rule of rules) {
      if (rule.enabled && sameLocation(rule, coordinates)) {
        map[rule.type] = rule.id;
      }
    }
    return { subscribed: Boolean(subscription), activeTypes: map };
  }, [service, available, hasLocation, locationLat, locationLon]);

  const applyState = useCallback((state) => {
    if (!state) return;
    setSubscribed(state.subscribed);
    setActiveTypes(state.activeTypes);
    // A load that succeeded supersedes whatever an earlier failure left on
    // screen; without this the stale message stays mounted next to state it
    // no longer describes.
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    const tracker = trackerRef.current;
    const { id, signal } = tracker.start();
    try {
      const state = await loadAlertState(signal);
      if (tracker.isCurrent(id) && mountedRef.current) applyState(state);
    } catch (caught) {
      if (isAbortError(caught, signal)) return;
      if (tracker.isCurrent(id) && mountedRef.current) {
        setError(caught?.message || "Couldn't load alert settings.");
      }
    }
  }, [loadAlertState, applyState]);

  // Load on mount / location change. setState happens inside the async
  // callback (after await), never synchronously in the effect body.
  // Changing location aborts the previous location's request rather than
  // letting it land, and the tracker's id guard discards anything that
  // resolves anyway.
  useEffect(() => {
    const tracker = trackerRef.current;
    const { id, signal } = tracker.start();
    (async () => {
      try {
        const state = await loadAlertState(signal);
        if (tracker.isCurrent(id) && mountedRef.current) applyState(state);
      } catch (caught) {
        if (isAbortError(caught, signal)) return;
        if (tracker.isCurrent(id) && mountedRef.current) {
          setError(caught?.message || "Couldn't load alert settings.");
        }
      }
    })();
    return () => {
      tracker.abort();
    };
  }, [loadAlertState, applyState]);

  const enabled = subscribed && Object.keys(activeTypes).length > 0;

  const run = useCallback(async (work) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setPermission(service.getPermission());
      await refresh();
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught?.message || "Something went wrong with alerts.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [refresh, service]);

  const enableAll = useCallback(
    () =>
      run(async () => {
        await service.enablePush();
        for (const type of ALERT_TYPES) {
          if (!activeTypes[type]) {
            await service.addRule({ type, location: ruleLocation(location) });
          }
        }
      }),
    [run, activeTypes, location, service]
  );

  const disableAll = useCallback(
    () =>
      run(async () => {
        await service.disablePush();
        for (const ruleId of Object.values(activeTypes)) {
          await service.removeRule(ruleId);
        }
      }),
    [run, activeTypes, service]
  );

  const toggleType = useCallback(
    (type) =>
      run(async () => {
        if (activeTypes[type]) {
          await service.removeRule(activeTypes[type]);
          return;
        }
        if (!subscribed) await service.enablePush();
        await service.addRule({ type, location: ruleLocation(location) });
      }),
    [run, activeTypes, subscribed, location, service]
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError("");
    setTestSent(false);
    try {
      await service.sendTestNotification();
      if (mountedRef.current) setTestSent(true);
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught?.message || "Couldn't send a test notification.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [service]);

  return {
    available,
    permission,
    enabled,
    subscribed,
    activeTypes,
    busy,
    error,
    testSent,
    enableAll,
    disableAll,
    toggleType,
    sendTest,
  };
}
