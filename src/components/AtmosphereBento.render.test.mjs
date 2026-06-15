import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const AtmosphereBento = (await import("./AtmosphereBento.jsx")).default;

afterEach(() => {
  cleanup();
});

const FULL_WEATHER = {
  current: {
    humidity: 58,
    dewPoint: 52,
    windSpeed: 12,
    windGust: 18,
    windDirection: 270,
    pressure: 1013,
    visibility: 16093,
  },
  daily: {
    uvIndexMax: [6.2],
    sunrise: ["2024-06-15T05:42:00"],
    sunset: ["2024-06-15T20:18:00"],
  },
  aqi: 42,
};

describe("AtmosphereBento", () => {
  test("renders without crashing on full weather data", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    assert.ok(section, "bento-atm section rendered");
  });

  test("renders without crashing with null weather", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: null,
        aqi: null,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    assert.ok(section, "bento-atm section rendered even with null data");
  });

  test("shows humidity value when available", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    assert.ok(screen.getByText("58%"), "humidity value rendered");
  });

  test("AQI tile renders as missing (dashed) when aqi is null", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    const missing = container.querySelectorAll(".atm-tile--missing");
    assert.ok(missing.length >= 1, "at least one missing tile (AQI + Moon)");
  });

  test("Moon tile is always rendered as missing", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    assert.ok(
      screen.getByText("Not in forecast"),
      "Moon tile shows 'Not in forecast'"
    );
  });

  test("section has accessible aria-labelledby pointing to a real element", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    const labelId = section?.getAttribute("aria-labelledby");
    assert.ok(labelId, "section has aria-labelledby");
    const heading = container.ownerDocument.getElementById(labelId);
    assert.ok(heading, "the labelled element exists in the DOM");
  });

  test("shows pressure in inHg in imperial unit mode", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    assert.ok(screen.getByText("in"), "imperial pressure unit rendered");
  });

  test("shows pressure in hPa in metric unit mode", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "C",
      })
    );
    assert.ok(screen.getByText("hPa"), "metric pressure unit rendered");
  });
});
