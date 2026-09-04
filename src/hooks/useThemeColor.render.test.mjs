import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render } = await import("@testing-library/react");
const { useThemeColor } = await import("./useThemeColor.js");

function ThemeProbe({ gradient }) {
  useThemeColor(gradient);
  return null;
}

function getMeta() {
  return document.querySelector('meta[name="theme-color"]');
}

afterEach(() => {
  cleanup();
  const meta = getMeta();
  if (meta) {
    meta.remove();
  }
});

describe("useThemeColor", () => {
  test("creates a theme-color meta if none exists and writes the gradient's first stop", () => {
    assert.equal(getMeta(), null);

    render(React.createElement(ThemeProbe, { gradient: ["#fb923c", "#ec4899", "#6366f1"] }));

    const meta = getMeta();
    assert.notEqual(meta, null);
    assert.equal(meta.getAttribute("content"), "#fb923c");
  });

  test("ignores invalid hex values so a partial gradient does not corrupt the chrome bar", () => {
    const seeded = document.createElement("meta");
    seeded.setAttribute("name", "theme-color");
    seeded.setAttribute("content", "#0b1c3f");
    document.head.appendChild(seeded);

    render(React.createElement(ThemeProbe, { gradient: ["not-a-color"] }));

    assert.equal(getMeta().getAttribute("content"), "#0b1c3f");
  });

  test("restores the previous color on unmount so global state stays clean", () => {
    const seeded = document.createElement("meta");
    seeded.setAttribute("name", "theme-color");
    seeded.setAttribute("content", "#0b1c3f");
    document.head.appendChild(seeded);

    const view = render(
      React.createElement(ThemeProbe, { gradient: ["#22d3ee", "#0e7490", "#115e59"] })
    );

    assert.equal(getMeta().getAttribute("content"), "#22d3ee");

    view.unmount();

    assert.equal(getMeta().getAttribute("content"), "#0b1c3f");
  });
});
