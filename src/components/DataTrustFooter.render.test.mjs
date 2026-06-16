import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup } = await import("@testing-library/react");
const DataTrustFooter = (await import("./DataTrustFooter.jsx")).default;

afterEach(() => {
  cleanup();
});

const LOCATION = { lat: 41.5, lon: -87.85 };
const TRUST_META = { weatherFetchedAt: 1_700_000_000_000 };
const WEATHER = { meta: { timezone: "America/Chicago" } };

describe("DataTrustFooter", () => {
  test("renders without crashing", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: LOCATION,
        trustMeta: TRUST_META,
      })
    );
    assert.ok(container.querySelector(".data-trust-footer"), "footer rendered");
  });

  test("renders with null props without crashing", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(container.querySelector(".data-trust-footer"), "footer rendered with null props");
  });

  test("shows N for positive latitude", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: LOCATION,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("41.50°N"),
      "positive lat shows N"
    );
  });

  test("shows W for negative longitude", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: LOCATION,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("87.85°W"),
      "negative lon shows W"
    );
  });

  test("shows timezone when available", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("America/Chicago"),
      "timezone rendered"
    );
  });

  test("footer has accessible label", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: LOCATION,
        trustMeta: TRUST_META,
      })
    );
    const footer = container.querySelector(".data-trust-footer");
    assert.ok(footer?.getAttribute("aria-label"), "footer has aria-label");
  });

  test("shows Open-Meteo source label", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("Open-Meteo"),
      "source label rendered"
    );
  });
});
