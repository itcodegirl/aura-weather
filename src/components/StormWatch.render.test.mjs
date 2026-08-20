import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const StormWatch = (await import("./StormWatch.jsx")).default;

afterEach(() => {
  cleanup();
});

const HOUR_MS = 60 * 60 * 1000;
// Index of "now" within the fixture series. The real forecast request carries
// past_hours=48, so a series always opens well before the current hour —
// these fixtures mirror that shape rather than pretending index 0 is now.
const NOW_INDEX = 2;
// A deliberately alarming value parked in the past slots. Nothing the
// component renders may ever come from these.
const STALE_CAPE = 2600;

function buildHourlyTime(start = Date.now() - NOW_INDEX * HOUR_MS) {
  return Array.from({ length: 6 }, (_, i) =>
    new Date(start + i * HOUR_MS).toISOString()
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
      cape: Array.from({ length: 6 }, (_, i) =>
        i < NOW_INDEX ? STALE_CAPE : cape
      ),
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

  test("reads CAPE at the current hour, not the start of the series", () => {
    // Regression guard. The forecast carries past_hours=48, so hourly[0] is
    // two days old; reading it rendered storm energy from the day before
    // yesterday as "live storm energy" — headlining "Severe" on a calm day,
    // or "All clear" while a real build-up was underway.
    const { container } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: null }),
        unit: "F",
        isRefreshing: false,
      })
    );
    assert.equal(
      container.textContent.includes(String(STALE_CAPE)),
      false,
      "must not surface the stale leading CAPE value"
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

  test("active risk uses the shared severity badge, not a private 'Level N of 4'", () => {
    // cape 600 → classifyStormRisk → "Moderate", score 2 (active).
    const { container } = render(
      React.createElement(StormWatch, {
        weather: buildWeather({ cape: 600 }),
        unit: "F",
        isRefreshing: false,
      })
    );
    const badge = container.querySelector(".severity-badge");
    assert.ok(badge, "active storm risk should render the shared severity-badge");
    assert.ok(
      badge.classList.contains("severity-badge--moderate"),
      "risk score 2 maps 1:1 to the shared 'moderate' tone"
    );
    assert.match(badge.textContent || "", /Moderate/);
    assert.equal(
      screen.queryByText(/Level \d of 4/),
      null,
      "the private numeric 'Level N of 4' vocabulary must be gone"
    );
    assert.equal(
      screen.queryByText(/Risk level \d of 4/),
      null,
      "the numeric summary vocabulary must be gone too"
    );
  });
});
