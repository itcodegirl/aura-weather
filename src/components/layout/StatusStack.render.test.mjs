import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { cleanup, fireEvent, render, screen } = await import(
  "@testing-library/react"
);
const StatusStack = (await import("./StatusStack.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("StatusStack", () => {
  test("announces when the visible forecast is restored from cache", () => {
    render(
      React.createElement(StatusStack, {
        showRefreshError: true,
        cacheStatus: "restored",
        onRetry() {},
      })
    );

    assert.ok(
      screen.getByText(
        "Live weather is unavailable. Showing your most recent saved forecast."
      )
    );
    assert.equal(screen.getByRole("alert").textContent.includes("Retry"), true);
  });

  test("keeps the standard refresh copy for in-memory last-known data", () => {
    render(
      React.createElement(StatusStack, {
        showRefreshError: true,
        cacheStatus: "idle",
        onRetry() {},
      })
    );

    assert.ok(
      screen.getByText(
        "Could not refresh weather right now. Showing last known data."
      )
    );
  });

  test("renders service worker update actions", () => {
    let refreshCount = 0;
    let dismissCount = 0;

    render(
      React.createElement(StatusStack, {
        serviceWorkerUpdateAvailable: true,
        onRefreshServiceWorkerUpdate() {
          refreshCount += 1;
        },
        onDismissServiceWorkerUpdate() {
          dismissCount += 1;
        },
      })
    );

    assert.ok(screen.getByText("App update ready."));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Later" }));

    assert.equal(refreshCount, 1);
    assert.equal(dismissCount, 1);
  });

  test("renders offline-ready acknowledgement", () => {
    let dismissCount = 0;

    render(
      React.createElement(StatusStack, {
        serviceWorkerOfflineReady: true,
        onDismissServiceWorkerOfflineReady() {
          dismissCount += 1;
        },
      })
    );

    assert.ok(screen.getByText("Offline shell ready."));

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    assert.equal(dismissCount, 1);
  });

  test("renders app install prompt actions", () => {
    let installCount = 0;
    let dismissCount = 0;

    render(
      React.createElement(StatusStack, {
        installPromptAvailable: true,
        onInstallApp() {
          installCount += 1;
        },
        onDismissInstallPrompt() {
          dismissCount += 1;
        },
      })
    );

    assert.ok(screen.getByText("Install Aura for faster access."));

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    fireEvent.click(screen.getByRole("button", { name: "Later" }));

    assert.equal(installCount, 1);
    assert.equal(dismissCount, 1);
  });

  test("defers the install prompt while an app update notice is visible", () => {
    render(
      React.createElement(StatusStack, {
        serviceWorkerUpdateAvailable: true,
        installPromptAvailable: true,
        onRefreshServiceWorkerUpdate() {},
        onDismissServiceWorkerUpdate() {},
        onInstallApp() {},
        onDismissInstallPrompt() {},
      })
    );

    assert.ok(screen.getByText("App update ready."));
    assert.equal(
      screen.queryByText("Install Aura for faster access."),
      null,
      "install prompt should wait behind the higher-priority update notice"
    );
  });
});
