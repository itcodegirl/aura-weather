import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render, waitFor } = await import("@testing-library/react");
const { usePwaInstallPrompt } = await import("./usePwaInstallPrompt.js");

function InstallPromptProbe({ onState }) {
  const installPrompt = usePwaInstallPrompt();

  React.useEffect(() => {
    onState(installPrompt);
  }, [installPrompt, onState]);

  return null;
}

function createBeforeInstallPromptEvent({ outcome = "accepted", onPrompt }) {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => {
    onPrompt?.();
  };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

afterEach(() => {
  cleanup();
});

describe("usePwaInstallPrompt", () => {
  test("captures the native install prompt and resolves accepted choices", async () => {
    let latest = null;
    let promptCount = 0;

    render(
      React.createElement(InstallPromptProbe, {
        onState(state) {
          latest = state;
        },
      })
    );

    await waitFor(() => assert.equal(latest?.installPromptAvailable, false));

    await act(async () => {
      window.dispatchEvent(
        createBeforeInstallPromptEvent({
          onPrompt() {
            promptCount += 1;
          },
        })
      );
    });

    await waitFor(() => assert.equal(latest.installPromptAvailable, true));

    let accepted = false;
    await act(async () => {
      accepted = await latest.promptInstall();
    });

    assert.equal(accepted, true);
    assert.equal(promptCount, 1);
    await waitFor(() => {
      assert.equal(latest.installPromptAvailable, false);
      assert.equal(latest.isInstallPromptOpening, false);
    });
  });

  test("hides the prompt after a user dismissal", async () => {
    let latest = null;

    render(
      React.createElement(InstallPromptProbe, {
        onState(state) {
          latest = state;
        },
      })
    );

    await act(async () => {
      window.dispatchEvent(createBeforeInstallPromptEvent({ outcome: "dismissed" }));
    });

    await waitFor(() => assert.equal(latest.installPromptAvailable, true));

    await act(async () => {
      latest.dismissInstallPrompt();
    });

    await waitFor(() => assert.equal(latest.installPromptAvailable, false));

    await act(async () => {
      window.dispatchEvent(createBeforeInstallPromptEvent({ outcome: "accepted" }));
    });

    await waitFor(() => assert.equal(latest.installPromptAvailable, false));
  });
});
