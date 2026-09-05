import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { isBrowserOffline } from "./network.js";

const hadNavigator = "navigator" in globalThis;
const realNavigator = globalThis.navigator;

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  if (hadNavigator) {
    setNavigator(realNavigator);
  } else {
    delete globalThis.navigator;
  }
});

describe("isBrowserOffline", () => {
  test("only a literal false counts as offline", () => {
    setNavigator({ onLine: false });
    assert.equal(isBrowserOffline(), true);

    setNavigator({ onLine: true });
    assert.equal(isBrowserOffline(), false);
  });

  /*
   * Both callers skip a fetch when this returns true, so every uncertain
   * answer has to be false. A jsdom or polyfill that leaves onLine undefined
   * would otherwise read as offline and strand the dashboard on a cached
   * snapshot with a "Browser is offline." error, on a machine that is online.
   */
  test("an absent or non-boolean onLine is not an offline answer", () => {
    setNavigator({});
    assert.equal(isBrowserOffline(), false);

    setNavigator({ onLine: undefined });
    assert.equal(isBrowserOffline(), false);

    setNavigator({ onLine: 0 });
    assert.equal(isBrowserOffline(), false);

    setNavigator({ onLine: "false" });
    assert.equal(isBrowserOffline(), false);
  });

  test("no navigator at all is not an offline answer", () => {
    delete globalThis.navigator;
    assert.equal(isBrowserOffline(), false);
  });
});
