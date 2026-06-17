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

describe("HeroCard content", () => {
  test("labels sunrise, sunset, and daylight values instead of showing unlabeled numbers", () => {
    render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.ok(screen.getByText("Sunrise"));
    assert.ok(screen.getByText("Sunset"));
    assert.ok(screen.getByText("Daylight"));
    assert.ok(
      screen.getByRole("group", {
        name: /Sunrise .* sunset .* daylight/i,
      })
    );
  });

  test("renders the UV index panel (head, peak, scale) when UV data is present", () => {
    // baseWeather daily.uvIndexMax = [7] → High band → "Use sun protection".
    render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.ok(screen.getByText("UV index"), "UV panel label renders");
    assert.ok(screen.getByText("Use sun protection"), "guidance head renders");
    assert.ok(screen.getByText("7.0"), "peak numeric renders to one decimal");
    assert.ok(
      screen.getByText(/High UV today/),
      "the guaranteed UV one-liner renders whenever UV data exists"
    );
  });

  test("drops the UV panel and one-liner entirely when UV data is missing", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ daily: { uvIndexMax: [null] } }),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(
      container.querySelector(".hero-uv-panel"),
      null,
      "no UV panel element when the reading is missing (trust contract)"
    );
    assert.equal(
      container.querySelector(".hero-uv-line"),
      null,
      "no UV one-liner when the reading is missing"
    );
    assert.equal(
      screen.queryByText("UV index"),
      null,
      "no fabricated UV panel label"
    );
  });

  test("no longer renders the retired wind/humidity/pressure/dew-point stat grid", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(
      container.querySelector(".hero-stats"),
      null,
      "the 4-stat grid is gone — those readings live in the Atmosphere bento"
    );
    assert.equal(
      container.querySelector(".hero-stats-note"),
      null,
      "the stat-grid missing-data note is gone with the grid"
    );
  });
});

describe("HeroCard accessibility scaffolding", () => {
  test("emits a visually-hidden h3 that names the section by location", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading, "hero card emits a heading element for SR navigation");
    assert.match(
      heading.textContent,
      /Current weather/,
      "heading announces the section role"
    );
    assert.match(
      heading.textContent,
      /Chicago/,
      "heading mentions the location so SR users hear which city"
    );
    assert.ok(
      heading.classList.contains("sr-only"),
      "heading is visually hidden so the visible layout stays unchanged"
    );
  });

  test("section is labelled by the heading id so SR users hear the section name", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    const section = container.querySelector("section.bento-hero");
    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading?.id, "heading carries a useId-generated id");
    assert.equal(
      section?.getAttribute("aria-labelledby"),
      heading.id,
      "section is wired to the heading via aria-labelledby"
    );
  });

  test("loading-fallback (no heroData) still emits the heading", () => {
    // Passing weather without `current` triggers the early-return
    // placeholder branch — it should still expose a heading so SR
    // users learn this card is loading.
    const { container } = render(
      React.createElement(HeroCard, {
        weather: { current: null, daily: null },
        location: baseLocation,
        unit: "F",
      })
    );

    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading, "fallback branch emits a heading too");
    assert.equal(heading.textContent, "Current weather");
  });
});

describe("HeroCard placeholder path (buildHeroData returned null)", () => {
  test("with a resolved location, surfaces the location name and names the missing piece", () => {
    // weather.current is missing — we know where the user is but the
    // forecast hasn't given us readings. The hero must not call this
    // a loading state (the previous "Loading weather" copy lied) and
    // must keep showing the actual location.
    render(
      React.createElement(HeroCard, {
        weather: { meta: { timezone: "America/Chicago" } },
        location: baseLocation,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    assert.ok(
      screen.getByText("Chicago, United States"),
      "real location stays visible on the placeholder path"
    );
    assert.ok(
      screen.getByText("Readings unavailable"),
      "date slot names the missing piece honestly"
    );
    assert.ok(
      screen.getByText(/Current readings aren[’']t available right now/),
      "body copy explains the state in the trust-contract voice"
    );
    assert.equal(
      screen.queryByText("Loading weather"),
      null,
      "must not regress to the old 'Loading weather' copy"
    );
    assert.equal(
      screen.queryByText("Location unavailable"),
      null,
      "must not regress to the old 'Location unavailable' copy when location is resolved"
    );
  });

  test("with no location, invites the user to pick one — does not fake a loading state", () => {
    render(
      React.createElement(HeroCard, {
        weather: null,
        location: null,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    assert.ok(screen.getByText("No location selected"));
    assert.ok(screen.getByText("Choose a place to begin"));
    assert.ok(screen.getByText(/Pick a location to see live conditions/));
    assert.equal(
      screen.queryByText("Loading weather"),
      null,
      "no-location path must not pretend to be loading either"
    );
  });

  test("placeholder body region is announced politely (role=status)", () => {
    render(
      React.createElement(HeroCard, {
        weather: null,
        location: null,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    const region = screen.getByRole("status");
    assert.ok(
      region.textContent.includes("Pick a location"),
      "status region carries the actionable invitation copy"
    );
  });
});
