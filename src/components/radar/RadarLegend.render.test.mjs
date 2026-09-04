import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render } = await import("@testing-library/react");
const RadarLegend = (await import("./RadarLegend.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("RadarLegend", () => {
  test("states what a clear map does not mean", () => {
    const { container } = render(React.createElement(RadarLegend));

    const note = container.querySelector(".radar-legend-note");
    assert.ok(note, "the coverage caption renders");
    assert.match(note.textContent, /clear map can also mean no coverage/);
  });

  /*
   * The caption is the only thing standing between an uncovered region and
   * a map that reads as "no rain" — deriveRadarState cannot distinguish the
   * two, so nothing downstream will catch its removal. Hiding it from the
   * accessibility tree would silently restore the ambiguity for exactly the
   * users least able to notice a transparent tile layer.
   */
  test("is not hidden from assistive technology", () => {
    const { container } = render(React.createElement(RadarLegend));

    const note = container.querySelector(".radar-legend-note");
    assert.equal(note.getAttribute("aria-hidden"), null);
    assert.equal(
      note.closest("[aria-hidden='true']"),
      null,
      "no ancestor hides the caption"
    );
  });

  test("keeps the source attribution alongside it", () => {
    const { container } = render(React.createElement(RadarLegend));

    const attribution = container.querySelector(".radar-legend-attribution");
    assert.ok(attribution, "attribution still renders");
    assert.match(attribution.textContent, /RainViewer/);
  });
});
