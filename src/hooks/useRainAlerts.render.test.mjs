// Alert-state hygiene: a later success must clear an earlier failure, and a
// location that was only renamed must not re-query the rules.
//
// The hook is driven through its `options.service` seam because
// isAlertsAvailable() is decided by build-time env vars that `node --test`
// cannot set — without the seam the hook short-circuits and never loads.

import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { useRainAlerts } = await import("./useRainAlerts.js");

const CHICAGO = { lat: 41.8781, lon: -87.6298, name: "Current location" };
const CHICAGO_NAMED = { lat: 41.8781, lon: -87.6298, name: "Chicago" };
const DENVER = { lat: 39.7392, lon: -104.9903, name: "Denver" };
// `node --test` runs render files concurrently, so waits are given room
// rather than relying on testing-library's 1 s default.
const WAIT = { timeout: 5000, interval: 25 };

const RULE = {
  id: "rule-1",
  type: "rain_incoming",
  enabled: true,
  location_lat: CHICAGO.lat,
  location_lon: CHICAGO.lon,
};

/**
 * Stand-in for services/pushAlerts.js, recording how often the rule query
 * runs. One instance is reused across renders: the hook keys its load effect
 * on the service object, so a fresh one per render would defeat the very
 * thing these tests measure.
 */
function createFakeService({ rules = [] } = {}) {
  const calls = { listRules: 0 };
  const service = {
    calls,
    failNextListRules: false,
    isAlertsAvailable: () => true,
    getPermission: () => "granted",
    getExistingSubscription: async () => ({ endpoint: "https://push.test/1" }),
    listRules: async () => {
      calls.listRules += 1;
      if (service.failNextListRules) {
        service.failNextListRules = false;
        throw new Error("Couldn't reach the alerts service.");
      }
      return rules;
    },
    enablePush: async () => {},
    disablePush: async () => {},
    addRule: async () => ({}),
    removeRule: async () => {},
    sendTestNotification: async () => {},
  };
  return service;
}

function AlertsProbe({ location, service, onState }) {
  const alerts = useRainAlerts(location, { service });

  React.useEffect(() => {
    onState(alerts);
  }, [alerts, onState]);

  return null;
}

function renderProbe(service, location) {
  let latest = null;
  const onState = (state) => {
    latest = state;
  };
  const view = render(
    React.createElement(AlertsProbe, { location, service, onState })
  );

  return {
    read: () => latest,
    async setLocation(nextLocation) {
      await act(async () => {
        view.rerender(
          React.createElement(AlertsProbe, {
            location: nextLocation,
            service,
            onState,
          })
        );
      });
    },
  };
}

// Lets any queued load settle, so "no second query" is a real observation
// rather than a race the assertion happened to win.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  cleanup();
});

describe("useRainAlerts", () => {
  test("a successful load clears the error a failed one left behind", async () => {
    const service = createFakeService({ rules: [RULE] });
    service.failNextListRules = true;

    const probe = renderProbe(service, CHICAGO);

    await waitFor(
      () => assert.equal(probe.read().error, "Couldn't reach the alerts service."),
      WAIT
    );

    await probe.setLocation(DENVER);

    await waitFor(
      () =>
        assert.equal(
          probe.read().error,
          "",
          "the stale message must not outlive the failure that produced it"
        ),
      WAIT
    );
    assert.equal(service.calls.listRules, 2);
  });

  test("renaming the same coordinates does not re-query the rules", async () => {
    const service = createFakeService({ rules: [RULE] });

    const probe = renderProbe(service, CHICAGO);

    await waitFor(() => assert.equal(service.calls.listRules, 1), WAIT);
    await waitFor(
      () => assert.deepEqual(probe.read().activeTypes, { rain_incoming: RULE.id }),
      WAIT
    );

    // What useLocation's geolocation path does: same coordinates, real name.
    await probe.setLocation(CHICAGO_NAMED);
    await settle();

    assert.equal(
      service.calls.listRules,
      1,
      "a name-only change cannot change which rules match"
    );
    assert.deepEqual(probe.read().activeTypes, { rain_incoming: RULE.id });

    await probe.setLocation(DENVER);

    await waitFor(() => assert.equal(service.calls.listRules, 2), WAIT);
    await waitFor(() => assert.deepEqual(probe.read().activeTypes, {}), WAIT);
  });
});
