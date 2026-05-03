// Render-test environment bootstrap.
//
// node:test does not provide a DOM. Set up a JSDOM and assign its
// objects as globals BEFORE React or testing-library load, so they
// pick up the right window/document references.

import { JSDOM } from "jsdom";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./test-render-loader.mjs", import.meta.url);

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const passthroughGlobals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLInputElement",
  "HTMLSpanElement",
  "Node",
  "NodeList",
  "Element",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "FocusEvent",
  "DocumentFragment",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "matchMedia",
];

for (const key of passthroughGlobals) {
  if (!(key in dom.window)) continue;
  // Some globals (e.g. `navigator` in Node 22) are accessor-only on
  // globalThis and reject direct assignment. defineProperty bypasses
  // the getter/setter and installs a plain writable value.
  try {
    globalThis[key] = dom.window[key];
  } catch {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  }
}

if (!globalThis.matchMedia) {
  // JSDOM omits matchMedia by default; provide a stub that always
  // reports "no match" so prefers-reduced-motion / reduced-data hooks
  // do not throw during render tests.
  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// React 19 + testing-library expect IS_REACT_ACT_ENVIRONMENT to be
// true so warnings about `act()` are suppressed.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Expose the URL helper so any test that needs to construct one
// (none today) does not hit a missing-global crash.
globalThis.URL = globalThis.URL || dom.window.URL;

// Mark the bootstrap as installed so render tests can import it once
// and rely on the side effect.
export const RENDER_TEST_ENVIRONMENT_READY = true;

// Keep a reference so the loader path resolves correctly when invoked
// with absolute URLs.
export const TEST_LOADER_URL = pathToFileURL("./test-render-loader.mjs").href;
