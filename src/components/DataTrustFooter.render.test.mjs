import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup } = await import("@testing-library/react");
const DataTrustFooter = (await import("./DataTrustFooter.jsx")).default;

afterEach(() => {
  cleanup();
});

const LOCATION = { lat: 41.5, lon: -87.85 };
const TRUST_META = { weatherFetchedAt: 1_700_000_000_000 };
const WEATHER = { meta: { timezone: "America/Chicago" } };

describe("DataTrustFooter source attribution", () => {
  /*
   * The footer is the one line every viewer sees that says where the data
   * came from, so it must not name a provider that supplied nothing. NWS
   * alerts are U.S.-only: outside that coverage alertsStatus is
   * "unsupported" and no NWS request contributed anything, yet the credit
   * was printed unconditionally (audit O-02).
   */
  function sourceTextFor(alertsStatus) {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: LOCATION,
        trustMeta: { ...TRUST_META, alertsStatus },
      })
    );
    const source = container.querySelector(".data-trust-footer-source");
    assert.ok(source, "expected the source line to render");
    return source.textContent;
  }

  test("credits NOAA/NWS only where its alerts were actually served", () => {
    assert.match(sourceTextFor("ready"), /NOAA\/NWS/);
  });

  test("drops the NOAA/NWS credit outside its coverage area", () => {
    for (const status of ["unsupported", "unavailable", "idle", undefined]) {
      const text = sourceTextFor(status);
      assert.equal(
        text.includes("NOAA"),
        false,
        `alertsStatus "${status}" served no NWS data; got: ${text}`
      );
      // Open-Meteo did supply the forecast on every one of these paths, so
      // dropping one credit must not drop the line.
      assert.match(text, /Open-Meteo/);
    }
  });
});

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
