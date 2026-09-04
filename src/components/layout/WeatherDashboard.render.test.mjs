import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const WeatherDashboard = (await import("./WeatherDashboard.jsx")).default;
const { buildMissingDashboardState } = await import(
  "../../mocks/missingData.js"
);

// useDeferredMount schedules through window.setTimeout (JSDOM provides no
// requestIdleCallback), so the fakes must be installed on window as well
// as globalThis for the flush to reach the deferred-mount timers.
let originalWindowSetTimeout;
let originalWindowClearTimeout;
let originalSetTimeout;
let originalClearTimeout;
let pendingTimers;
let nextTimerId;

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

describe("WeatherDashboard missing-data demo isolation", () => {
  beforeEach(() => {
    installFakeTimers();
  });

  afterEach(() => {
    cleanup();
    restoreTimers();
  });

  test("never mounts the radar or rain-alerts panels under the mock", async () => {
    const view = render(
      React.createElement(WeatherDashboard, buildDashboardProps({
        isMissingMock: true,
      }))
    );

    // Past every deferred-mount window (radar 2s, rain alerts 3s), then
    // drain macrotasks so any lazy chunk that did start would land.
    await act(async () => {
      flushTimersUpTo(10_000);
    });
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    });

    // The radar slot holds the honest demo card, not a radar mount or a
    // "loading" promise that would never honestly resolve.
    assert.match(view.container.textContent, /Radar not queried in this demo/);
    assert.doesNotMatch(
      view.container.textContent,
      /Loading precipitation radar/
    );
    assert.equal(view.container.querySelector(".radar-card"), null);
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
    assert.equal(view.container.querySelector(".rain-alerts"), null);
    assert.doesNotMatch(view.container.textContent, /Rain alert/i);
  });

  test("keeps the demo radar card in the radar layout slot with status semantics", () => {
    const view = render(
      React.createElement(WeatherDashboard, buildDashboardProps({
        isMissingMock: true,
      }))
    );

    const slot = view.container.querySelector(".bento-radar");
    assert.notEqual(slot, null);
    const emptyState = slot.querySelector(".card-empty");
    assert.notEqual(emptyState, null);
    assert.equal(emptyState.getAttribute("role"), "status");
    assert.match(emptyState.textContent, /never contacted/);
  });

  test("still schedules the real radar mount without the mock flag", async () => {
    const view = render(
      React.createElement(WeatherDashboard, buildDashboardProps())
    );

    await act(async () => {
      flushTimersUpTo(10_000);
    });

    // The lazy radar chunk is now loading: its Suspense fallback proves the
    // mount was attempted, so the demo gate (not the harness) is what kept
    // it out in the tests above.
    assert.match(view.container.textContent, /Loading precipitation radar/);
    assert.doesNotMatch(
      view.container.textContent,
      /Radar not queried in this demo/
    );
  });
});

describe("WeatherDashboard loading placeholders stay quiet", () => {
  beforeEach(() => {
    installFakeTimers();
  });

  afterEach(() => {
    cleanup();
    restoreTimers();
  });

  test("mounts several placeholders without exposing a single live region", async () => {
    const view = render(
      React.createElement(WeatherDashboard, buildDashboardProps())
    );

    // Past every deferred-mount window, so the staggered placeholders
    // (hourly / radar / supplemental) are all on the page at once — the
    // exact moment role="status" used to queue a serial announcement.
    await act(async () => {
      flushTimersUpTo(10_000);
    });

    const placeholders = [...view.container.querySelectorAll(".loading-card")];
    assert.ok(
      placeholders.length > 0,
      "expected at least one loading placeholder to be mounted"
    );

    for (const placeholder of placeholders) {
      assert.equal(
        placeholder.getAttribute("role"),
        null,
        `loading placeholder "${placeholder.textContent}" must not be a live region`
      );
      assert.equal(placeholder.getAttribute("aria-live"), null);
      // The visible title already carries the wording; a matching
      // aria-label would double-announce it as name + content.
      assert.equal(placeholder.getAttribute("aria-label"), null);
    }
  });

  test("keeps the placeholder title visible and the bento's aria-busy signal intact", async () => {
    const view = render(
      React.createElement(
        WeatherDashboard,
        buildDashboardProps({ isBackgroundLoading: true })
      )
    );

    await act(async () => {
      flushTimersUpTo(10_000);
    });

    // Quiet, not hidden: the copy stays in the reading order, and
    // work-in-progress rides on aria-busy rather than an announcement.
    assert.match(view.container.textContent, /Loading precipitation radar/);
    assert.equal(
      view.container.querySelector("main.bento").getAttribute("aria-busy"),
      "true"
    );
    const placeholder = view.container.querySelector(".loading-card");
    assert.equal(placeholder.getAttribute("aria-busy"), "true");
  });
});
