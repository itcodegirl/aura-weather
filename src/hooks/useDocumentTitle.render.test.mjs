import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render } = await import("@testing-library/react");
const { useDocumentTitle } = await import("./useDocumentTitle.js");

function TitleProbe({ location }) {
  useDocumentTitle(location);
  return null;
}

const STATIC_TITLE = "Aura - Atmospheric Intelligence";

beforeEach(() => {
  document.title = STATIC_TITLE;
});

afterEach(() => {
  cleanup();
  document.title = STATIC_TITLE;
});

describe("useDocumentTitle", () => {
  test("preserves the static <title> when location has no name", () => {
    render(React.createElement(TitleProbe, { location: null }));
    assert.equal(document.title, STATIC_TITLE);

    cleanup();
    render(React.createElement(TitleProbe, { location: { name: "" } }));
    assert.equal(document.title, STATIC_TITLE);
  });

  test("writes name and country into the document title when both are present", () => {
    render(
      React.createElement(TitleProbe, {
        location: { name: "Tokyo", country: "Japan" },
      })
    );

    assert.equal(document.title, "Tokyo, Japan · Aura Weather");
  });

  test("omits the country segment when the location has no country", () => {
    render(
      React.createElement(TitleProbe, {
        location: { name: "Current location", country: "" },
      })
    );

    assert.equal(document.title, "Current location · Aura Weather");
  });

  test("restores the previous title on unmount so leaving the dashboard does not strand a city in the tab title", () => {
    const view = render(
      React.createElement(TitleProbe, {
        location: { name: "Reykjavík", country: "Iceland" },
      })
    );

    assert.equal(document.title, "Reykjavík, Iceland · Aura Weather");

    view.unmount();

    assert.equal(document.title, STATIC_TITLE);
  });

  test("ignores non-string location fields without crashing", () => {
    render(
      React.createElement(TitleProbe, {
        location: { name: 42, country: { not: "a string" } },
      })
    );

    assert.equal(document.title, STATIC_TITLE);
  });
});
