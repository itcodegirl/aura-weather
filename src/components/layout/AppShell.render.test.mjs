import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const { AppLoadingState } = await import("./AppShell.jsx");

let originalSetTimeout;
let originalClearTimeout;
let pendingTimers;
let nextTimerId;

function installFakeTimers() {
  pendingTimers = new Map();
  nextTimerId = 1;
  originalSetTimeout = globalThis.setTimeout;
  originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (handler, delay) => {
    const id = nextTimerId++;
    pendingTimers.set(id, { handler, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    pendingTimers.delete(id);
  };
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
}

describe("AppLoadingState slow-load beat", () => {
  beforeEach(() => {
    installFakeTimers();
  });

  afterEach(() => {
    cleanup();
    restoreTimers();
  });

  test("renders the upbeat 'Connecting' copy on first mount", () => {
    const view = render(React.createElement(AppLoadingState));
    assert.match(view.container.textContent, /Connecting to weather providers/);
    assert.doesNotMatch(view.container.textContent, /Still working/);
  });

  test("swaps in the slow-network reassurance after the timer elapses", async () => {
    const view = render(React.createElement(AppLoadingState));
    await act(async () => {
      flushTimersUpTo(7000);
    });
    assert.match(view.container.textContent, /Still working/);
    assert.match(view.container.textContent, /network may be slow/);
  });

  test("keeps the loader region polite and labelled across the swap", async () => {
    const view = render(React.createElement(AppLoadingState));
    const status = view.container.querySelector('[role="status"]');
    assert.notEqual(status, null);
    assert.equal(status.getAttribute("aria-live"), "polite");
    assert.equal(status.getAttribute("aria-label"), "Loading weather dashboard");

    await act(async () => {
      flushTimersUpTo(7000);
    });

    // Region attributes must survive the copy swap so the SR keeps
    // listening for the same live region rather than dropping it.
    assert.equal(status.getAttribute("role"), "status");
    assert.equal(status.getAttribute("aria-live"), "polite");
  });
});
