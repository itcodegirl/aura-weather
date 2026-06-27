import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup } = await import("@testing-library/react");
const { usePersistentStorage } = await import("./useAppShellEffects.js");

function Probe() {
  usePersistentStorage();
  return React.createElement("div");
}

function setStorage(storage) {
  Object.defineProperty(globalThis.navigator, "storage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  cleanup();
  setStorage(undefined);
});

describe("usePersistentStorage", () => {
  test("requests durable storage when the origin is not already persistent", async () => {
    let persistCalls = 0;
    setStorage({
      persisted: async () => false,
      persist: async () => {
        persistCalls += 1;
        return true;
      },
    });

    render(React.createElement(Probe));
    await flushMicrotasks();

    assert.equal(persistCalls, 1, "persist() is requested exactly once");
  });

  test("does not re-request when storage is already persistent", async () => {
    let persistCalls = 0;
    setStorage({
      persisted: async () => true,
      persist: async () => {
        persistCalls += 1;
        return true;
      },
    });

    render(React.createElement(Probe));
    await flushMicrotasks();

    assert.equal(persistCalls, 0, "no redundant persist() when already granted");
  });

  test("no-ops without throwing when the Storage Manager is unavailable", async () => {
    setStorage(undefined);

    assert.doesNotThrow(() => render(React.createElement(Probe)));
    await flushMicrotasks();
  });
});
