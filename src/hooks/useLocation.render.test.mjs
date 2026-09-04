import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, act, waitFor } = await import("@testing-library/react");
const {
  CURRENT_LOCATION_NAME,
  CURRENT_LOCATION_NOTICE,
  CURRENT_LOCATION_UNNAMED_NOTICE,
  LOCATION_LOOKUP_FAILED_NOTICE,
  LOCATION_PERMISSION_BLOCKED_NOTICE,
  LOCATION_UNSUPPORTED_NOTICE,
  useLocation,
} = await import("./useLocation.js");

const originalGeolocation = navigator.geolocation;
const realFetch = globalThis.fetch;

function setGeolocation(value) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value,
  });
}

function LocationProbe({ onReady, onResolved, onNotice }) {
  const locationApi = useLocation(onResolved, { onNotice });

  React.useEffect(() => {
    onReady(locationApi);
  }, [locationApi, onReady]);

  return null;
}

afterEach(() => {
  cleanup();
  setGeolocation(originalGeolocation);
  globalThis.fetch = realFetch;
});

describe("useLocation", () => {
  test("surfaces an honest hint when reverse geocoding can't name the GPS fix", async () => {
    // reverseGeocode resolves to null on failure (network / no usable name),
    // so the label stays the generic device-location one — and the notice
    // should say *why* it's generic rather than look like a real lookup.
    globalThis.fetch = async () => {
      throw new Error("reverse geocode disabled in test");
    };

    let locationApi = null;
    const resolvedLocations = [];

    setGeolocation({
      getCurrentPosition(onSuccess) {
        onSuccess({
          coords: {
            latitude: 42.1234,
            longitude: -88.5678,
          },
        });
      },
    });

    render(
      React.createElement(LocationProbe, {
        onReady: (api) => {
          locationApi = api;
        },
        onResolved: (...args) => {
          resolvedLocations.push(args);
        },
      })
    );

    await waitFor(() => assert.ok(locationApi));

    await act(async () => {
      locationApi.loadCurrentLocation();
    });

    // The immediate GPS resolve uses the plain device-location notice...
    await waitFor(() => {
      assert.ok(
        resolvedLocations.some((entry) => entry[4] === CURRENT_LOCATION_NOTICE),
        "the immediate device-location notice is emitted first"
      );
    });

    // ...and once naming fails, the latest notice becomes the honest hint.
    await waitFor(() => {
      assert.equal(
        resolvedLocations.at(-1)?.[4],
        CURRENT_LOCATION_UNNAMED_NOTICE
      );
    });

    const latest = resolvedLocations.at(-1);
    assert.equal(latest[0], 42.1234);
    assert.equal(latest[1], -88.5678);
    assert.equal(latest[2], CURRENT_LOCATION_NAME);
    assert.equal(latest[3], "");
    assert.equal(latest[4], CURRENT_LOCATION_UNNAMED_NOTICE);
  });

  test("upgrades the GPS label to a real place name once reverse geocoding resolves", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          city: "Palos Hills",
          principalSubdivision: "Illinois",
          countryName: "United States",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    let locationApi = null;
    const resolvedLocations = [];

    setGeolocation({
      getCurrentPosition(onSuccess) {
        onSuccess({ coords: { latitude: 41.7, longitude: -87.82 } });
      },
    });

    render(
      React.createElement(LocationProbe, {
        onReady: (api) => {
          locationApi = api;
        },
        onResolved: (...args) => {
          resolvedLocations.push(args);
        },
      })
    );

    await waitFor(() => assert.ok(locationApi));

    await act(async () => {
      locationApi.loadCurrentLocation();
    });

    // The immediate GPS resolve uses the generic label first...
    await waitFor(() => {
      assert.ok(
        resolvedLocations.some((entry) => entry[2] === CURRENT_LOCATION_NAME),
        "the generic 'Current location' label is emitted first"
      );
    });

    // ...then the reverse-geocode resolve replaces it with the place name.
    await waitFor(() => {
      const latest = resolvedLocations.at(-1);
      assert.equal(latest?.[2], "Palos Hills");
    });

    const latest = resolvedLocations.at(-1);
    assert.equal(latest[0], 41.7);
    assert.equal(latest[1], -87.82);
    assert.equal(latest[2], "Palos Hills");
    assert.equal(latest[3], "United States");
    assert.equal(latest[4], CURRENT_LOCATION_NOTICE);
  });
});

describe("useLocation when a My-location request fails", () => {
  /*
   * Every one of these paths used to resolve DEFAULT_LOCATION, so failing to
   * get a fix navigated the reader to Palos Hills. The button is only
   * reachable with a city already on screen — requestCurrentPositionWithFallback
   * has no caller but loadCurrentLocation — so that always discarded whatever
   * they were reading, as the response to an error they did not cause.
   *
   * Each test asserts the *absence* of a further resolve. The bootstrap effect
   * emits one on mount, so the check is that the count does not grow: a
   * regression here re-adds an entry rather than changing an existing one.
   */
  async function runFailingLookup(geolocation) {
    let locationApi = null;
    const resolvedLocations = [];
    const notices = [];

    setGeolocation(geolocation);

    render(
      React.createElement(LocationProbe, {
        onReady: (api) => {
          locationApi = api;
        },
        onResolved: (...args) => {
          resolvedLocations.push(args);
        },
        onNotice: (notice) => {
          notices.push(notice);
        },
      })
    );

    await waitFor(() => assert.ok(locationApi));
    // The bootstrap resolve has landed; anything after this is the lookup.
    const afterBootstrap = resolvedLocations.length;

    await act(async () => {
      locationApi.loadCurrentLocation();
    });
    await waitFor(() => assert.ok(notices.length > 0));

    return { resolvedLocations, notices, afterBootstrap };
  }

  test("a denied permission prompt reports without moving the reader", async () => {
    const { resolvedLocations, notices, afterBootstrap } =
      await runFailingLookup({
        getCurrentPosition(_onSuccess, onError) {
          // PERMISSION_DENIED
          onError({ code: 1 });
        },
      });

    assert.equal(
      resolvedLocations.length,
      afterBootstrap,
      "declining the prompt must not resolve a new location"
    );
    assert.deepEqual(notices, [LOCATION_PERMISSION_BLOCKED_NOTICE]);
    // The copy must not name a city, because none is being shown.
    assert.doesNotMatch(notices[0], /Palos Hills/);
  });

  test("a position error that is not a denial also leaves the city alone", async () => {
    const { resolvedLocations, notices, afterBootstrap } =
      await runFailingLookup({
        getCurrentPosition(_onSuccess, onError) {
          // POSITION_UNAVAILABLE — a different recovery hint, same rule.
          onError({ code: 2 });
        },
      });

    assert.equal(resolvedLocations.length, afterBootstrap);
    assert.deepEqual(notices, [LOCATION_LOOKUP_FAILED_NOTICE]);
    assert.doesNotMatch(notices[0], /Palos Hills/);
  });

  test("a browser without geolocation reports without moving the reader", async () => {
    const { resolvedLocations, notices, afterBootstrap } =
      await runFailingLookup(undefined);

    assert.equal(resolvedLocations.length, afterBootstrap);
    assert.deepEqual(notices, [LOCATION_UNSUPPORTED_NOTICE]);
  });

  test("the lookup spinner stops even though nothing navigated", async () => {
    // markLookupComplete used to run alongside the resolve. With the resolve
    // gone it has to still fire, or the button spins forever on a denial.
    let locationApi = null;
    const notices = [];

    setGeolocation({
      getCurrentPosition(_onSuccess, onError) {
        onError({ code: 1 });
      },
    });

    render(
      React.createElement(LocationProbe, {
        onReady: (api) => {
          locationApi = api;
        },
        onResolved: () => {},
        onNotice: (notice) => {
          notices.push(notice);
        },
      })
    );

    await waitFor(() => assert.ok(locationApi));
    await act(async () => {
      locationApi.loadCurrentLocation();
    });
    await waitFor(() => assert.ok(notices.length > 0));
    await waitFor(() => assert.equal(locationApi.isLocatingCurrent, false));
  });
});
