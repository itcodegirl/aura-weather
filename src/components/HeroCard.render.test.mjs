import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const HeroCard = (await import("./HeroCard.jsx")).default;

afterEach(() => {
  cleanup();
});

const baseLocation = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Chicago",
  country: "United States",
};

const baseWeather = {
  current: {
    temperature: 67.4,
    humidity: 58,
    feelsLike: 68,
    conditionCode: 2,
    windSpeed: 9.8,
    windGust: 14.2,
    windDirection: 220,
    pressure: 1014,
    dewPoint: 52,
    cloudCover: 34,
    visibility: 12000,
  },
  daily: {
    temperatureMax: [70],
    temperatureMin: [55],
    sunrise: ["2026-04-21T06:18:00-05:00"],
    sunset: ["2026-04-21T19:41:00-05:00"],
    uvIndexMax: [7],
  },
};

function buildWeather(overrides = {}) {
  return {
    ...baseWeather,
    ...overrides,
    current: { ...baseWeather.current, ...(overrides.current || {}) },
    daily: { ...baseWeather.daily, ...(overrides.daily || {}) },
  };
}

function getStatValue(label) {
  // The Stat layout renders the label and value as siblings under a
  // shared parent. Find the label element, then walk up to the .stat
  // and return the .stat-value text.
  const labelEl = screen.getByText(label);
  const statEl = labelEl.closest(".stat");
  return statEl?.querySelector(".stat-value");
}

describe("HeroCard with missing readings", () => {
  test("renders 0%/0 hPa nowhere when humidity and pressure are null", () => {
    const weather = buildWeather({
      current: { humidity: null, pressure: null, dewPoint: null },
    });

    const { container } = render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    const visibleText = container.textContent || "";
    assert.equal(
      visibleText.includes("0%"),
      false,
      "rendered text must not contain '0%'"
    );
    assert.equal(
      visibleText.includes("0 hPa"),
      false,
      "rendered text must not contain '0 hPa'"
    );
    assert.equal(
      visibleText.includes("—°F"),
      false,
      "rendered text must not contain the malformed '—°F' string"
    );
  });

  test("marks missing humidity, pressure, and dew point with the .is-missing visual modifier", () => {
    const weather = buildWeather({
      current: { humidity: null, pressure: null, dewPoint: null },
    });

    render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    for (const label of ["Humidity", "Pressure", "Dew Point"]) {
      const valueEl = getStatValue(label);
      assert.ok(valueEl, `${label} value renders`);
      assert.equal(valueEl.textContent.trim(), "—", `${label} renders dash`);
      assert.ok(
        valueEl.classList.contains("is-missing"),
        `${label} carries .is-missing modifier`
      );
    }
  });

  test("announces missing values to assistive tech as 'No data available'", () => {
    const weather = buildWeather({
      current: { humidity: null, pressure: null },
    });

    render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    // Three places carry the "No data available" label: the two
    // missing stats here, plus the absence of any readings means
    // there should be exactly two announcements (humidity + pressure).
    const announcements = screen.getAllByLabelText("No data available");
    assert.equal(announcements.length, 2);
  });

  test("shows the helper note when any hero stat is missing", () => {
    const weather = buildWeather({
      current: { humidity: null },
    });

    render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    const note = screen.getByText(/Some readings are unavailable from the provider/i);
    assert.ok(note);
    assert.equal(note.getAttribute("role"), "status");
  });

  test("does not show the helper note when every hero stat is present", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(container.querySelector(".hero-stats-note"), null);
  });

  test("renders real readings normally when nothing is missing", () => {
    render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(getStatValue("Humidity").textContent.trim(), "58%");
    assert.equal(getStatValue("Pressure").textContent.trim(), "1014 hPa");
    assert.equal(getStatValue("Dew Point").textContent.trim(), "52°F");
    assert.equal(
      screen.queryByLabelText("No data available"),
      null,
      "no missing-data labels when every reading is present"
    );
  });
});
