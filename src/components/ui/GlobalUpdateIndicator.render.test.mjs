import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, screen } = await import("@testing-library/react");
const GlobalUpdateIndicator = (await import("./GlobalUpdateIndicator.jsx"))
  .default;

afterEach(() => {
  cleanup();
});

const ANNOUNCEMENT_TEXT = "Forecast updated.";

function getAnnouncement(container) {
  // The announcement region is the last `.sr-only[role=status]` rendered
  // by the indicator subtree. We don't query by role globally because
  // other parts of the indicator carry no status role and we want to be
  // tight about which element we're inspecting.
  return container.querySelector('.sr-only[role="status"]');
}

describe("GlobalUpdateIndicator refresh-completion announcement", () => {
  test("does not announce on initial mount when not refreshing", () => {
    const { container } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: 1_700_000_000_000 },
        nowMs: 1_700_000_000_000,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    const region = getAnnouncement(container);
    assert.ok(region, "announcement region renders");
    assert.equal(region.textContent.trim(), "");
  });

  test("does not announce on initial mount even if isRefreshing starts true", () => {
    const { container } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: 1_700_000_000_000 },
        nowMs: 1_700_000_000_000,
        onRefresh() {},
        isRefreshing: true,
      })
    );

    const region = getAnnouncement(container);
    assert.equal(region.textContent.trim(), "");
  });

  test("announces when isRefreshing flips true → false AND fetch timestamp advances", () => {
    const initialFetchedAt = 1_700_000_000_000;
    const updatedFetchedAt = 1_700_000_300_000;

    const { container, rerender } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: initialFetchedAt },
        nowMs: initialFetchedAt,
        onRefresh() {},
        isRefreshing: true,
      })
    );

    rerender(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: updatedFetchedAt },
        nowMs: updatedFetchedAt,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    const region = getAnnouncement(container);
    assert.equal(region.textContent.trim(), ANNOUNCEMENT_TEXT);
  });

  test("does not announce when refresh ends but the fetch timestamp is unchanged (failed refresh)", () => {
    const fetchedAt = 1_700_000_000_000;

    const { container, rerender } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: fetchedAt },
        nowMs: fetchedAt,
        onRefresh() {},
        isRefreshing: true,
      })
    );

    rerender(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: fetchedAt },
        nowMs: fetchedAt,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    const region = getAnnouncement(container);
    assert.equal(region.textContent.trim(), "");
  });

  test("does not announce when neither isRefreshing nor fetchedAt changed", () => {
    const fetchedAt = 1_700_000_000_000;

    const { container, rerender } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: fetchedAt },
        nowMs: fetchedAt,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    rerender(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: fetchedAt },
        nowMs: fetchedAt + 60_000,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    const region = getAnnouncement(container);
    assert.equal(region.textContent.trim(), "");
  });

  test("announcement region carries aria-live polite + atomic so SR users hear the change", () => {
    const { container } = render(
      React.createElement(GlobalUpdateIndicator, {
        trustMeta: { weatherFetchedAt: 1_700_000_000_000 },
        nowMs: 1_700_000_000_000,
        onRefresh() {},
        isRefreshing: false,
      })
    );

    const region = getAnnouncement(container);
    assert.equal(region.getAttribute("aria-live"), "polite");
    assert.equal(region.getAttribute("aria-atomic"), "true");
    assert.equal(region.getAttribute("role"), "status");
  });
});

const MINUTE_MS = 60_000;

// The pill measures age against the shared minute ticker (useTimeNow),
// which reads the real clock — not a prop — so every timestamp below is
// derived from Date.now(). Offsets are exact minute multiples and the
// ticker samples a few milliseconds later, so getAgeMinutes' floor()
// lands on the intended minute rather than one below it.
function renderPill(trustMeta) {
  return render(
    React.createElement(GlobalUpdateIndicator, {
      trustMeta,
      onRefresh() {},
      isRefreshing: false,
    })
  );
}

function getVisibleState(container) {
  return container.querySelector(".global-update-state").textContent.trim();
}

describe("GlobalUpdateIndicator refresh-button accessible name", () => {
  test("a live forecast names its state, its age, and the action", () => {
    const now = Date.now();
    const { container } = renderPill({ weatherFetchedAt: now });

    assert.ok(
      screen.getByRole("button", {
        name: "Live forecast. Updated just now. Tap to refresh weather.",
      })
    );
    assert.equal(getVisibleState(container), "live");
  });

  test("a restored snapshot announces 'Saved', the word the visible pill carries", () => {
    const now = Date.now();
    const { container } = renderPill({
      weatherFetchedAt: now - 90 * MINUTE_MS,
      cacheStatus: "restored",
      cacheCapturedAt: now - 40 * MINUTE_MS,
    });

    // The trust-relevant word: without it a screen-reader user hears an
    // age and an action and cannot tell a saved forecast from a live one.
    assert.ok(
      screen.getByRole("button", {
        name: "Saved forecast. Updated 40m ago. Tap to refresh weather.",
      })
    );
    assert.equal(getVisibleState(container), "saved");
  });

  test("a restored snapshot still announces 'Saved' when it is younger than the stale threshold", () => {
    const now = Date.now();
    const { container } = renderPill({
      weatherFetchedAt: now - 90 * MINUTE_MS,
      cacheStatus: "restored",
      cacheCapturedAt: now,
    });

    assert.ok(
      screen.getByRole("button", {
        name: "Saved forecast. Updated just now. Tap to refresh weather.",
      })
    );
    assert.equal(getVisibleState(container), "saved");
  });

  test("a stale forecast announces 'Stale' alongside its age", () => {
    const now = Date.now();
    const { container } = renderPill({
      weatherFetchedAt: now - 40 * MINUTE_MS,
    });

    assert.ok(
      screen.getByRole("button", {
        name: "Stale forecast. Updated 40m ago. Tap to refresh weather.",
      })
    );
    assert.equal(getVisibleState(container), "stale");
  });
});
