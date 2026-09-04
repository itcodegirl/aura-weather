import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render } = await import("@testing-library/react");
const { useUrlLocationSync } = await import("./useUrlLocationSync.js");

function ProbeWithSync({ location }) {
  useUrlLocationSync(location);
  return null;
}

afterEach(() => {
  cleanup();
  // Reset the JSDOM URL to a known baseline between tests so each
  // test reads from a clean slate. JSDOM's Location object replaces
  // history state when the URL is reassigned.
  window.history.replaceState({}, "", "/");
});

describe("useUrlLocationSync write path", () => {
  test("writes lat / lon / name / country into the URL via replaceState", () => {
    render(
      React.createElement(ProbeWithSync, {
        location: {
          lat: 35.6762,
          lon: 139.6503,
          name: "Tokyo",
          country: "Japan",
        },
      })
    );
    const params = new URLSearchParams(window.location.search);
    assert.equal(params.get("lat"), "35.6762");
    assert.equal(params.get("lon"), "139.6503");
    assert.equal(params.get("name"), "Tokyo");
    assert.equal(params.get("country"), "Japan");
  });

  test("preserves unrelated query params like ?mock=missing", () => {
    window.history.replaceState({}, "", "/?mock=missing");
    render(
      React.createElement(ProbeWithSync, {
        location: {
          lat: 41.8781,
          lon: -87.6298,
          name: "Chicago",
          country: "United States",
        },
      })
    );
    const params = new URLSearchParams(window.location.search);
    assert.equal(params.get("mock"), "missing");
    assert.equal(params.get("lat"), "41.8781");
  });

  test("does not write when lat or lon are missing", () => {
    window.history.replaceState({}, "", "/?keep=this");
    render(
      React.createElement(ProbeWithSync, {
        location: { name: "No coords" },
      })
    );
    assert.equal(window.location.search, "?keep=this");
  });

  test("does not call replaceState a second time when the location is unchanged", () => {
    let replaceCalls = 0;
    const realReplace = window.history.replaceState.bind(window.history);
    window.history.replaceState = (...args) => {
      replaceCalls += 1;
      return realReplace(...args);
    };

    const view = render(
      React.createElement(ProbeWithSync, {
        location: {
          lat: 48.8566,
          lon: 2.3522,
          name: "Paris",
          country: "France",
        },
      })
    );
    assert.equal(replaceCalls, 1);

    // Re-render with the same location values.
    view.rerender(
      React.createElement(ProbeWithSync, {
        location: {
          lat: 48.8566,
          lon: 2.3522,
          name: "Paris",
          country: "France",
        },
      })
    );
    assert.equal(replaceCalls, 1);
  });

  test("uses replaceState rather than pushState (no history pollution)", () => {
    // Push a marker entry first; if the hook used pushState, our
    // marker would no longer be the previous entry.
    window.history.pushState({ marker: "before" }, "", "/?marker=before");
    const beforeLength = window.history.length;
    render(
      React.createElement(ProbeWithSync, {
        location: {
          lat: 51.5074,
          lon: -0.1278,
          name: "London",
        },
      })
    );
    assert.equal(window.history.length, beforeLength);
  });
});
