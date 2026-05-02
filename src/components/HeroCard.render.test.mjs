import "global-jsdom/register";
import { test, describe, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

const { render, screen, cleanup } = await import("@testing-library/react");
const { default: HeroCard } = await import("./HeroCard.jsx");
const { buildMissingWeatherModel, MISSING_MOCK_LOCATION } = await import(
  "../mocks/missingData.js"
);
const { MISSING_VALUE_LABEL } = await import("../utils/missingData.js");

before(() => {
  if (typeof globalThis.IS_REACT_ACT_ENVIRONMENT === "undefined") {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
});

afterEach(() => {
  cleanup();
});

describe("HeroCard with missing readings", () => {
  test("never renders 0, 0%, 0 hPa, or a stripped temperature unit", () => {
    const weather = buildMissingWeatherModel();
    render(
      createElement(HeroCard, {
        weather,
        location: { ...MISSING_MOCK_LOCATION },
        unit: "F",
        showClimateContext: false,
        climateStatus: "disabled",
        isRefreshing: false,
        lastUpdatedAt: Date.now(),
        nowMs: Date.now(),
      })
    );

    const heroSection = document.querySelector(".hero-card");
    assert.ok(heroSection, "hero card should render");
    const text = heroSection.textContent ?? "";

    assert.ok(!text.includes("0%"), `humidity must not render as 0%, got: ${text}`);
    assert.ok(
      !text.includes("0 hPa"),
      `pressure must not render as 0 hPa, got: ${text}`
    );

    assert.ok(
      !/(^|\s)0°F/.test(text),
      `temperature must not render as 0°F, got: ${text}`
    );
    assert.ok(!/—°F/.test(text), `dash must not be paired with °F, got: ${text}`);
    assert.ok(!/—°C/.test(text), `dash must not be paired with °C, got: ${text}`);

    const dataUnavailableMatches = screen.getAllByText(MISSING_VALUE_LABEL, {
      exact: false,
    });
    assert.ok(
      dataUnavailableMatches.length >= 4,
      `expected 'Data unavailable' across humidity/pressure/wind/dew-point Stats, found ${dataUnavailableMatches.length}`
    );
  });

  test("renders the location name even when readings are missing", () => {
    const weather = buildMissingWeatherModel();
    render(
      createElement(HeroCard, {
        weather,
        location: { ...MISSING_MOCK_LOCATION },
        unit: "F",
        showClimateContext: false,
        climateStatus: "disabled",
        lastUpdatedAt: Date.now(),
        nowMs: Date.now(),
      })
    );

    assert.ok(
      screen.getByText(/Sample City/i),
      "location header should still display the city name"
    );
  });
});
