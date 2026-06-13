import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const ExposureSection = (await import("./ExposureSection.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("ExposureSection section header status", () => {
  test("no header status badge when both readings are present", () => {
    const { container } = render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: 5.2,
        aqiStatus: "ready",
      })
    );
    const head = container.querySelector(".bento-exposure .metric-head");
    const badge = head?.querySelector(".metric-context");
    assert.equal(
      badge,
      null,
      "with both readings present, the gauges and pills convey the data state — no header badge needed"
    );
    assert.equal(
      screen.queryByText("Live"),
      null,
      "the previous 'Live' status word must not appear (mixes vocabulary with the global update pill)"
    );
    assert.equal(
      screen.queryByText("Partial data"),
      null,
      "engineering phrase must not appear when both readings are present"
    );
  });

  test("'One reading missing' surfaces when only one of AQI / UV is available", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: null,
        uvIndex: 5.2,
        aqiStatus: "unavailable",
      })
    );
    assert.ok(
      screen.getByText("One reading missing"),
      "section header tells the user the section is partially populated, in plain language"
    );
    assert.equal(
      screen.queryByText("Partial data"),
      null,
      "must not regress to the engineering phrase"
    );
  });
});

describe("ExposureSection severe alert summary", () => {
  test("surfaces the highest-priority weather alert below the exposure gauges", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: 7.6,
        aqiStatus: "ready",
        alert: {
          event: "Flood Watch",
          headline: "Flood Watch issued for Cook County by NWS Chicago IL",
          priority: "moderate",
          endsAt: "2026-06-11T23:00:00-05:00",
        },
      })
    );

    assert.ok(screen.getByText("Active alert"));
    assert.ok(screen.getByText("Flood Watch"));
    assert.ok(screen.getByText(/Flood Watch issued for Cook County/));
    assert.ok(screen.getByText("Details below"));
  });

  test("does not reserve alert space when there are no active alerts", () => {
    const { container } = render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: 7.6,
        aqiStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".exposure-alert"), null);
  });
});

describe("ExposureSection AQI scale (real EPA 0–500 range)", () => {
  test("supportText denominator is 500, not 300", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: 5,
        aqiStatus: "ready",
      })
    );
    assert.ok(
      screen.getByText(/0[–-]500 scale/),
      "supportText uses the real EPA 0–500 range so a wildfire-day AQI of 400 doesn't read as 'over the max'"
    );
    assert.equal(
      screen.queryByText(/out of 300/),
      null,
      "must not regress to the previous misleading 300 ceiling"
    );
  });

  test("a wildfire-tier AQI of 400 renders cleanly without 'over the max' framing", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: 400,
        uvIndex: 5,
        aqiStatus: "ready",
      })
    );
    assert.ok(
      screen.getByText(/Current AQI is 400 on a 0[–-]500 scale\./),
      "extreme AQI is described correctly within its real ceiling"
    );
  });
});

describe("ExposureSection card-level context labels", () => {
  test("missing AQI card context reads 'Unavailable', not 'AQI offline'", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: null,
        uvIndex: 5.2,
        aqiStatus: "unavailable",
      })
    );
    // The Air Quality metric card's context badge should now say
    // "Unavailable" — the card title ("Air Quality") already announces
    // the metric, so saying "AQI offline" beneath it repeats AQI plus
    // the engineering "offline" word.
    assert.equal(
      screen.queryByText("AQI offline"),
      null,
      "engineering phrase must not appear"
    );
    // The literal text "Unavailable" appears as the missing-state
    // context badge on the Air Quality card.
    assert.ok(screen.getAllByText("Unavailable").length >= 1);
  });

  test("missing UV card context also reads 'Unavailable', not 'UV offline'", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: null,
        aqiStatus: "ready",
      })
    );
    assert.equal(
      screen.queryByText("UV offline"),
      null,
      "engineering phrase must not appear"
    );
    assert.ok(screen.getAllByText("Unavailable").length >= 1);
  });

  test("present readings keep their short user-friendly context labels", () => {
    render(
      React.createElement(ExposureSection, {
        aqi: 42,
        uvIndex: 5.2,
        aqiStatus: "ready",
      })
    );
    assert.ok(
      screen.getByText("AQI"),
      "AQI is a recognised acronym and works as a short context label"
    );
    assert.ok(
      screen.getByText("Today"),
      "UV reading context is 'Today' — names the time scope"
    );
  });
});
