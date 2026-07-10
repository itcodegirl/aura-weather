import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup } = await import(
  "@testing-library/react"
);
const SyncAccountPanel = (await import("./SyncAccountPanel.jsx")).default;

afterEach(() => {
  cleanup();
});

function noop() {}

describe("SyncAccountPanel default-collapsed contract", () => {
  test("starts collapsed when the device is backed up — no auto-expanded body", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: true,
        syncState: { status: "idle" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    const toggle = screen.getByRole("button", {
      name: /expand cloud backup controls/i,
    });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    // The stop-backup / back-up-now buttons live inside the body — they
    // must NOT be in the DOM when the body is collapsed.
    assert.equal(
      screen.queryByRole("button", { name: "Stop backup" }),
      null,
      "body controls must not render before the user opens the panel"
    );
    assert.equal(
      screen.queryByRole("button", { name: "Back up now" }),
      null,
      "back-up-now must not render before the user opens the panel"
    );
  });

  test("starts collapsed when the device is not backed up", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: false,
        syncState: { status: "idle" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    const toggle = screen.getByRole("button", {
      name: /expand cloud backup controls/i,
    });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(screen.queryByRole("button", { name: "Start backup" }), null);
  });

  test("force-opens when the backup has a live error so the user can act on it", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: false,
        syncState: {
          status: "error",
          error: "Could not restore your backup.",
        },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    assert.ok(
      screen.getByRole("button", { name: "Start backup" }),
      "start-backup button is reachable when an error forces the body open"
    );
    assert.ok(
      screen.getByText("Could not restore your backup."),
      "error text is visible alongside the body"
    );
  });

  test("force-opens while a backup is actively in flight", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: true,
        syncState: { status: "syncing" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    const backUpNow = screen.getByRole("button", { name: "Back up now" });
    assert.ok(backUpNow);
    assert.equal(backUpNow.getAttribute("aria-busy"), "true");
  });

  test("clicking the toggle reveals the body and exposes the stop-backup control", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: true,
        syncState: { status: "idle" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /expand cloud backup controls/i })
    );

    assert.ok(
      screen.getByRole("button", { name: "Stop backup" }),
      "stop-backup control appears once the user opens the panel"
    );
  });
});

describe("SyncAccountPanel makes no cross-device promise", () => {
  test("describes a per-device backup, never a shareable key or cross-device sync", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: true,
        syncState: { status: "idle" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /expand cloud backup controls/i })
    );

    const body = document.body.textContent;
    assert.match(body, /backed up to the cloud from this device/i);
    assert.match(body, /Clearing your browser data starts a fresh backup/i);

    // An anonymous session cannot be moved to another device, so the UI must
    // not offer a key to paste or claim the cities follow the user around.
    assert.doesNotMatch(body, /across devices/i);
    assert.doesNotMatch(body, /sync key/i);
    assert.equal(
      screen.queryByRole("textbox", { name: /sync key/i }),
      null,
      "the paste-a-key input is gone"
    );
    assert.equal(
      screen.queryByRole("button", { name: "Connect" }),
      null,
      "the Connect action is gone"
    );
  });

  test("does not claim the cities are backed up before a backup exists", () => {
    render(
      React.createElement(SyncAccountPanel, {
        syncConnected: false,
        syncState: { status: "idle" },
        onCreateSyncAccount: noop,
        onDisconnectSyncAccount: noop,
        onSyncNow: noop,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /expand cloud backup controls/i })
    );

    const body = document.body.textContent;
    assert.match(body, /stored on this device only/i);
    assert.doesNotMatch(
      body,
      /are backed up to the cloud/i,
      "an un-backed-up device must not be told its cities are backed up"
    );
  });
});
