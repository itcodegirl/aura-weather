import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const AppErrorBoundary = (await import("./AppErrorBoundary.jsx")).default;

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

describe("AppErrorBoundary", () => {
  test("renders the full-page error card with both Try again and Reload app buttons", () => {
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(FlakyChild)
      )
    );

    assert.match(view.container.textContent, /Something went wrong/);
    const tryAgain = view.getByRole("button", { name: "Try again" });
    const reload = view.getByRole("button", { name: "Reload app" });
    assert.notEqual(tryAgain, null);
    assert.notEqual(reload, null);

    console.error = originalError;
  });

  test("the alert region announces assertively so a screen reader hears the crash", () => {
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(FlakyChild)
      )
    );

    const alert = view.container.querySelector('[role="alert"]');
    assert.notEqual(alert, null);
    assert.equal(alert.getAttribute("aria-live"), "assertive");

    console.error = originalError;
  });

  test("Try again soft-remounts children without a page reload so transient crashes recover cheaply", async () => {
    const originalError = console.error;
    console.error = () => {};

    const view = render(
      React.createElement(
        AppErrorBoundary,
        null,
        React.createElement(FlakyChild)
      )
    );

    assert.match(view.container.textContent, /Something went wrong/);

    throwOnRender = false;
    const tryAgain = view.getByRole("button", { name: "Try again" });

    await act(async () => {
      tryAgain.click();
    });

    const ok = view.queryByTestId("ok");
    assert.notEqual(ok, null, "expected the soft retry to remount children");
    assert.equal(ok.textContent, "Loaded");

    console.error = originalError;
  });
});
