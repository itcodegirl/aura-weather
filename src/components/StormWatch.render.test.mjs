import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const StormWatch = (await import("./StormWatch.jsx")).default;

afterEach(() => {
  cleanup();
});

function buildHourlyTime(start = new Date("2026-04-21T12:00:00Z").getTime()) {
  return Array.from({ length: 6 }, (_, i) =>
    new Date(start + i * 60 * 60 * 1000).toISOString()
  );
}

function buildWeather({ cape, conditionCode = 2 } = {}) {
  return {
    current: {
      conditionCode,
      windSpeed: 8,
      windGust: 12,
      windDirection: 180,
      pressure: 1014,
      dewPoint: 52,
    },
    hourly: {
      time: buildHourlyTime(),
      cape: [cape],
      pressure: [1012, 1013, 1013, 1014, 1014, 1015],
      rainChance: [10, 20, 35, 55, 40, 20],
    },
  };
}

describe("StormWatch (slimmed risk synthesis)", () => {
  test("always titles itself 'Storm watch' — never the bento's 'Atmosphere'", () => {
    for (const cape of [50, 600, null]) {
      render(
        React.createElement(StormWatch, {
          weather: buildWeather({ cape }),
          unit: "F",
          isRefreshing: false,
        })
      );
      assert.ok(
        screen.getByRole("heading", { name: "Storm watch" }),
        `heading should read 'Storm watch' (cape=${cape})`
      );
      assert.equal(
        screen.queryByRole("heading", { name: "Atmosphere" }),
        null,
        "must not reuse the bento's 'Atmosphere' title"
      );
      cleanup();
    }
  });

  test("data-storm-active mirrors the active-signal state", () => {
    const { container, rerender } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 50 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.equal(
      container.querySelector(".bento-storm").getAttribute("data-storm-active"),
      null,
      "absent on the calm path"
    );
    rerender(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 600 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.equal(
      container.querySelector(".bento-storm").getAttribute("data-storm-active"),
      "true"
    );
  });

  test("renders a plain-English why-line synthesis", () => {
    const { container } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 600 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    const why = container.querySelector(".storm-why");
    assert.ok(why, "why-line element should render");
    assert.ok(
      (why.textContent || "").trim().length > 0,
      "why-line should carry synthesis prose"
    );
  });

  test("does NOT render the Pressure / Wind / Comfort gauges (those live in the bento)", () => {
    const { container } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 600 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.equal(container.querySelector(".pressure-sparkline"), null);
    assert.equal(container.querySelector(".wind-compass"), null);
    assert.equal(container.querySelector(".comfort-scale"), null);
    assert.equal(container.querySelector(".storm-snapshot"), null);
  });

  test("surfaces CAPE (storm fuel) when the reading is present", () => {
    render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 600 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.ok(
      screen.queryAllByText(/J\/kg/).length >= 1,
      "CAPE J/kg should appear when present"
    );
  });

  test("missing CAPE shows a placeholder, never a fabricated reading", () => {
    const { container } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: null }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.equal(screen.queryAllByText(/J\/kg/).length, 0, "no J/kg when CAPE missing");
    assert.ok(
      container.querySelector(".cape-value.is-missing"),
      "CAPE value should render the missing-data placeholder"
    );
  });
});
