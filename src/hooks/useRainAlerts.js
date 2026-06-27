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

function sameLocation(rule, location) {
  return (
    Math.abs(Number(rule.location_lat) - Number(location?.lat)) < 1e-4 &&
    Math.abs(Number(rule.location_lon) - Number(location?.lon)) < 1e-4
  );
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
export function useRainAlerts(location) {
  const available = isAlertsAvailable();
  const [permission, setPermission] = useState(() => getPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [activeTypes, setActiveTypes] = useState({}); // type -> rule id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testSent, setTestSent] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Pure fetch — returns the subscription/rule state for this location
  // without touching React state, so callers control when setState runs.
  const loadAlertState = useCallback(async () => {
    if (!available || !location) return null;
    const [subscription, rules] = await Promise.all([
      getExistingSubscription(),
      listRules(),
    ]);
    const map = {};
    for (const rule of rules) {
      if (rule.enabled && sameLocation(rule, location)) {
        map[rule.type] = rule.id;
      }
    }
    return { subscribed: Boolean(subscription), activeTypes: map };
  }, [available, location]);

  const applyState = useCallback((state) => {
    if (!state) return;
    setSubscribed(state.subscribed);
    setActiveTypes(state.activeTypes);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const state = await loadAlertState();
      if (mountedRef.current) applyState(state);
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught?.message || "Couldn't load alert settings.");
      }
    }
  }, [loadAlertState, applyState]);

  // Load on mount / location change. setState happens inside the async
  // callback (after await), never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await loadAlertState();
        if (!cancelled && mountedRef.current) applyState(state);
      } catch (caught) {
        if (!cancelled && mountedRef.current) {
          setError(caught?.message || "Couldn't load alert settings.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAlertState, applyState]);

  const enabled = subscribed && Object.keys(activeTypes).length > 0;

  const run = useCallback(async (work) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setPermission(getPermission());
      await refresh();
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught?.message || "Something went wrong with alerts.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [refresh]);

  const enableAll = useCallback(
    () =>
      run(async () => {
        await enablePush();
        for (const type of ALERT_TYPES) {
          if (!activeTypes[type]) {
            await addRule({ type, location: ruleLocation(location) });
          }
        }
      }),
    [run, activeTypes, location]
  );

  const disableAll = useCallback(
    () =>
      run(async () => {
        await disablePush();
        for (const ruleId of Object.values(activeTypes)) {
          await removeRule(ruleId);
        }
      }),
    [run, activeTypes]
  );

  const toggleType = useCallback(
    (type) =>
      run(async () => {
        if (activeTypes[type]) {
          await removeRule(activeTypes[type]);
          return;
        }
        if (!subscribed) await enablePush();
        await addRule({ type, location: ruleLocation(location) });
      }),
    [run, activeTypes, subscribed, location]
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError("");
    setTestSent(false);
    try {
      await sendTestNotification();
      if (mountedRef.current) setTestSent(true);
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught?.message || "Couldn't send a test notification.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, []);

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
