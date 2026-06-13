import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

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

describe("useDocumentTitle location display", () => {
  test("uses friendly country names in the tab title", () => {
    render(
      React.createElement(TitleProbe, {
        location: {
          name: "Township of Palos",
          country: "United States of America (the)",
        },
      })
    );

    assert.equal(
      document.title,
      "Township of Palos, United States · Aura Weather"
    );
  });
});
