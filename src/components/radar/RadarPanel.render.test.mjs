import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render, screen } = await import("@testing-library/react");
const RadarPanel = (await import("./RadarPanel.jsx")).default;

function setRadarLoadingOverride() {
  window.history.replaceState(null, "", "/?radar=loading");
}

function renderRadarPanel(location) {
  return render(React.createElement(RadarPanel, { location }));
}

beforeEach(() => {
  setRadarLoadingOverride();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("RadarPanel coordinate trust", () => {
  test("null latitude and longitude show the unavailable location state instead of (0,0)", () => {
    const view = renderRadarPanel({
      lat: null,
      lon: null,
      name: "Unknown place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.ok(screen.getByText("Pick a place to see its precipitation radar."));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("undefined latitude and longitude show the unavailable location state", () => {
    const view = renderRadarPanel({
      name: "Unknown place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("empty coordinate strings are rejected instead of coercing to (0,0)", () => {
    const view = renderRadarPanel({
      lat: "",
      lon: "   ",
      name: "Blank place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("invalid coordinate strings are rejected", () => {
    const view = renderRadarPanel({
      lat: "not-a-latitude",
      lon: "not-a-longitude",
      name: "Broken place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("NaN and Infinity coordinates are rejected", () => {
    const view = renderRadarPanel({
      lat: Number.NaN,
      lon: Number.POSITIVE_INFINITY,
      name: "Impossible place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("valid numeric coordinates still enter the radar loading state", () => {
    const view = renderRadarPanel({
      lat: 41.8781,
      lon: -87.6298,
      name: "Chicago",
    });

    assert.ok(screen.getByText(/Tuning in the latest radar/));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });
});
