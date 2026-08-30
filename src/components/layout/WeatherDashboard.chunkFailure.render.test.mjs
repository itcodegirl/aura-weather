import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import "../../../scripts/test-render-setup.mjs";

// Break the supplemental chunk before WeatherDashboard is imported, so its
// lazy mount hits a rejecting import() exactly as it would when the network
// drops the chunk. This lives in its own test file because the hook is
// process-wide: the sibling WeatherDashboard.render.test.mjs needs the chunk
// intact.
register("../../../scripts/test-render-fail-module-loader.mjs", import.meta.url, {
  data: { brokenSuffixes: ["/layout/SupplementalWeatherPanels.jsx"] },
});

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const WeatherDashboard = (await import("./WeatherDashboard.jsx")).default;
const { buildMissingDashboardState } = await import(
  "../../mocks/missingData.js"
);

// Mirrors WeatherDashboard.render.test.mjs: useDeferredMount schedules through
// window.setTimeout, so the fakes have to be installed on window too.
let originalWindowSetTimeout;
let originalWindowClearTimeout;
let originalSetTimeout;
let originalClearTimeout;
let pendingTimers;
let nextTimerId;
let originalConsoleError;

function installFakeTimers() {
  pendingTimers = new Map();
  nextTimerId = 1;
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  originalWindowSetTimeout = globalThis.window.setTimeout;
  originalWindowClearTimeout = globalThis.window.clearTimeout;
  const fakeSetTimeout = (handler, delay) => {
    const id = nextTimerId++;
    pendingTimers.set(id, { handler, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    pendingTimers.delete(id);
  };
  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;
  globalThis.window.setTimeout = fakeSetTimeout;
  globalThis.window.clearTimeout = fakeClearTimeout;
}

function flushTimersUpTo(targetMs) {
  for (const [id, { handler, delay }] of [...pendingTimers.entries()]) {
    if (delay <= targetMs) {
      pendingTimers.delete(id);
      handler();
    }
  }
}

function restoreTimers() {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.window.setTimeout = originalWindowSetTimeout;
  globalThis.window.clearTimeout = originalWindowClearTimeout;
}

function buildDashboardProps(overrides = {}) {
  const state = buildMissingDashboardState();
  return {
    weather: state.weather,
    location: state.location,
    unit: "F",
    weatherDataUnit: state.weatherDataUnit,
    climateComparison: state.climateComparison,
    isBackgroundLoading: false,
    trustMeta: state.trustMeta,
    prefersReducedData: false,
    ...overrides,
  };
}

async function renderPastDeferredMounts() {
  const view = render(
    React.createElement(WeatherDashboard, buildDashboardProps())
  );

  // Past every deferred-mount window, then drain macrotasks so the rejected
  // supplemental import lands and the boundary commits its fallback.
  await act(async () => {
    flushTimersUpTo(10_000);
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }

  return view;
}

describe("WeatherDashboard supplemental chunk failure", () => {
  beforeEach(() => {
    installFakeTimers();
    // The boundary logs every catch; keep the expected one out of the report.
    originalConsoleError = console.error;
    console.error = () => {};
  });

  afterEach(() => {
    cleanup();
    restoreTimers();
    console.error = originalConsoleError;
  });

  test("contains the failure to one labelled card instead of the whole dashboard", async () => {
    const view = await renderPastDeferredMounts();

    const fallbacks = view.container.querySelectorAll(
      ".panel-boundary-fallback"
    );
    assert.equal(
      fallbacks.length,
      1,
      "exactly one panel boundary fell back — the supplemental chunk's"
    );
    assert.match(
      fallbacks[0].textContent,
      /Extended weather details is unavailable/
    );
    assert.notEqual(
      view.getByRole("button", { name: "Try again" }),
      null,
      "the failed card offers a retry"
    );
  });

  test("leaves the hero, hourly and radar slots mounted", async () => {
    const view = await renderPastDeferredMounts();

    // The app-level boundary would have replaced all of this with
    // "Something went wrong" had the chunk failure escaped.
    assert.doesNotMatch(view.container.textContent, /Something went wrong/);

    for (const selector of [".bento-hero", ".bento-chart", ".bento-radar"]) {
      const slot = view.container.querySelector(selector);
      assert.notEqual(slot, null, `${selector} still rendered`);
      assert.equal(
        slot.classList.contains("panel-boundary-fallback"),
        false,
        `${selector} is its own card, not a boundary fallback`
      );
    }
  });

  test("keeps the failed card in the supplemental layout slot", async () => {
    const view = await renderPastDeferredMounts();

    const fallback = view.container.querySelector(".panel-boundary-fallback");
    assert.ok(
      fallback.classList.contains("bento-supplemental-loading"),
      "fallback carries the grid class the loading card used, so the bento does not reflow"
    );
    assert.equal(fallback.getAttribute("role"), "alert");
  });
});
