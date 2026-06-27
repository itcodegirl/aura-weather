import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, act, waitFor } = await import("@testing-library/react");
const {
  CURRENT_LOCATION_NAME,
  CURRENT_LOCATION_NOTICE,
  CURRENT_LOCATION_UNNAMED_NOTICE,
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

function LocationProbe({ onReady, onResolved }) {
  const locationApi = useLocation(onResolved);

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
