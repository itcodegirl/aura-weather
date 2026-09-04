import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const HeaderControls = (await import("./HeaderControls.jsx")).default;

const NOOP = () => {};

function renderHeaderControls(overrides = {}) {
  const props = {
    citySearchRef: React.createRef(),
    loadWeather: NOOP,
    loadCurrentLocation: NOOP,
    clearSavedLocation: NOOP,
    savedCities: [],
    location: null,
    loadSavedCity: NOOP,
    forgetSavedCity: NOOP,
    syncConnected: false,
    syncState: null,
    createSyncAccount: NOOP,
    disconnectSyncAccount: NOOP,
    syncSavedCitiesNow: NOOP,
    isLocatingCurrent: false,
    isGeolocationSupported: true,
    showClimateContext: true,
    setShowClimateContext: NOOP,
    unit: "F",
    setUnit: NOOP,
    hasPersistedLocation: false,
    ...overrides,
  };

  return render(React.createElement(HeaderControls, props));
}

afterEach(() => {
  cleanup();
});

describe("HeaderControls mobile settings drawer", () => {
  test("renders the Settings toggle in a collapsed state by default", () => {
    const view = renderHeaderControls();
    const toggle = view.getByRole("button", { name: "Show display settings" });

    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    const panel = view.container.querySelector(".app-header-secondary");
    assert.notEqual(panel, null);
    assert.equal(panel.classList.contains("is-mobile-open"), false);
  });

  test("clicking the toggle flips aria-expanded and exposes the panel", async () => {
    const view = renderHeaderControls();
    const toggle = view.getByRole("button", { name: "Show display settings" });

    await act(async () => {
      toggle.click();
    });

    const expanded = view.getByRole("button", { name: "Hide display settings" });
    assert.equal(expanded.getAttribute("aria-expanded"), "true");
    const panel = view.container.querySelector(".app-header-secondary");
    assert.equal(panel.classList.contains("is-mobile-open"), true);

    await act(async () => {
      expanded.click();
    });

    const collapsed = view.getByRole("button", { name: "Show display settings" });
    assert.equal(collapsed.getAttribute("aria-expanded"), "false");
  });

  test("the toggle controls the same panel id it advertises", () => {
    const view = renderHeaderControls();
    const toggle = view.getByRole("button", { name: "Show display settings" });
    const controlsId = toggle.getAttribute("aria-controls");

    assert.notEqual(controlsId, null);
    const panel = view.container.ownerDocument.getElementById(controlsId);
    assert.notEqual(panel, null);
    assert.equal(panel.getAttribute("role"), "region");
    assert.equal(panel.getAttribute("aria-label"), "Display settings");
  });
});
