import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render, screen } = await import("@testing-library/react");
const { default: HeroCard } = await import("./HeroCard.jsx");

afterEach(() => {
  cleanup();
});

describe("HeroCard location display", () => {
  test("uses friendly country names from deep links on the placeholder path", () => {
    render(
      React.createElement(HeroCard, {
        weather: { meta: { timezone: "America/Chicago" } },
        location: {
          lat: 41.698,
          lon: -87.83498,
          name: "Township of Palos",
          country: "United States of America (the)",
        },
        unit: "F",
      })
    );

    assert.ok(screen.getByText("Township of Palos, United States"));
    assert.equal(
      screen.queryByText(/United States of America \(the\)/),
      null
    );
  });
});
