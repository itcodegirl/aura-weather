import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const DisplaySettingsControls = (
  await import("./DisplaySettingsControls.jsx")
).default;

const NOOP = () => {};

function renderControls(overrides = {}) {
  const props = {
    isMobileOpen: false,
    showClimateContext: true,
    onEnableClimateContext: NOOP,
    onDisableClimateContext: NOOP,
    unit: "F",
    onSetUnitF: NOOP,
    onSetUnitC: NOOP,
    onClearSavedLocation: NOOP,
    hasPersistedLocation: false,
    ...overrides,
  };

  return render(React.createElement(DisplaySettingsControls, props));
}

afterEach(() => {
  cleanup();
});

describe("DisplaySettingsControls settings announcements", () => {
  test("does not announce anything on first render so screen readers stay quiet on initial mount", () => {
    const view = renderControls();
    const liveRegion = view.container.querySelector('[role="status"][aria-live="polite"]');
    assert.notEqual(liveRegion, null, "expected a polite live region to exist");
    assert.equal(liveRegion.textContent, "");
  });

  test("re-rendering with a new unit publishes a polite announcement", async () => {
    const view = renderControls({ unit: "F" });
    const liveRegion = view.container.querySelector('[role="status"][aria-live="polite"]');

    await act(async () => {
      view.rerender(
        React.createElement(DisplaySettingsControls, {
          isMobileOpen: false,
          showClimateContext: true,
          onEnableClimateContext: NOOP,
          onDisableClimateContext: NOOP,
          unit: "C",
          onSetUnitF: NOOP,
          onSetUnitC: NOOP,
          onClearSavedLocation: NOOP,
          hasPersistedLocation: false,
        })
      );
    });

    assert.match(liveRegion.textContent, /Celsius/);
  });

  test("re-rendering with a new climate-context preference publishes a polite announcement", async () => {
    const view = renderControls({ showClimateContext: true });
    const liveRegion = view.container.querySelector('[role="status"][aria-live="polite"]');

    await act(async () => {
      view.rerender(
        React.createElement(DisplaySettingsControls, {
          isMobileOpen: false,
          showClimateContext: false,
          onEnableClimateContext: NOOP,
          onDisableClimateContext: NOOP,
          unit: "F",
          onSetUnitF: NOOP,
          onSetUnitC: NOOP,
          onClearSavedLocation: NOOP,
          hasPersistedLocation: false,
        })
      );
    });

    assert.match(liveRegion.textContent, /Climate context hidden/);
  });
});
