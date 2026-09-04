import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const PanelErrorBoundary = (await import("./PanelErrorBoundary.jsx")).default;

let throwOnRender = true;

function FlakyChild() {
  if (throwOnRender) {
    throw new Error("kaboom");
  }
  return React.createElement("p", { "data-testid": "ok" }, "Loaded");
}

afterEach(() => {
  cleanup();
  throwOnRender = true;
});

describe("PanelErrorBoundary", () => {
  test("renders the labelled fallback with a Try again button when a child throws", () => {
    // Suppress the expected console.error from the boundary's catch.
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        PanelErrorBoundary,
        { label: "Hourly outlook" },
        React.createElement(FlakyChild)
      )
    );

    assert.match(
      view.container.textContent,
      /Hourly outlook is unavailable/
    );
    const retryButton = view.getByRole("button", { name: "Try again" });
    assert.notEqual(retryButton, null);

    console.error = originalError;
  });

  test("retry remounts children so a now-stable child renders successfully", async () => {
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        PanelErrorBoundary,
        { label: "Storm watch" },
        React.createElement(FlakyChild)
      )
    );

    assert.match(view.container.textContent, /Storm watch is unavailable/);

    // Flip the flag so the next render of FlakyChild succeeds, then
    // click "Try again" to remount.
    throwOnRender = false;
    const retryButton = view.getByRole("button", { name: "Try again" });

    await act(async () => {
      retryButton.click();
    });

    const ok = view.queryByTestId("ok");
    assert.notEqual(ok, null);
    assert.equal(ok.textContent, "Loaded");

    console.error = originalError;
  });

  test("a thrown sibling does not take down the rest of the dashboard", () => {
    // Mirrors the production layout: each dashboard card is its own
    // PanelErrorBoundary, so one card throwing must leave the
    // others rendering. This guards against accidentally regressing
    // back to a single top-level boundary that would crash everything.
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        "div",
        null,
        React.createElement(
          PanelErrorBoundary,
          { label: "Hero" },
          React.createElement(FlakyChild)
        ),
        React.createElement(
          PanelErrorBoundary,
          { label: "Forecast" },
          React.createElement(
            "p",
            { "data-testid": "neighbour" },
            "Sibling alive"
          )
        )
      )
    );

    assert.match(view.container.textContent, /Hero is unavailable/);
    const sibling = view.queryByTestId("neighbour");
    assert.notEqual(sibling, null, "neighbouring card still renders");
    assert.equal(sibling.textContent, "Sibling alive");

    console.error = originalError;
  });

  test("fallback uses the panel's grid-class so it stays in the right bento slot", () => {
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        PanelErrorBoundary,
        { label: "Hero", className: "bento-hero" },
        React.createElement(FlakyChild)
      )
    );

    const fallback = view.container.querySelector(".panel-boundary-fallback");
    assert.ok(fallback, "fallback section renders");
    assert.ok(
      fallback.classList.contains("bento-hero"),
      "fallback carries the caller-provided grid-class so layout doesn't shift"
    );

    console.error = originalError;
  });
});
