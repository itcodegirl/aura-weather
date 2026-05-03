import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const MetricCard = (await import("./MetricCard.jsx")).default;

afterEach(() => {
  cleanup();
});

const baseStatus = { label: "Good", color: "#22c55e" };

describe("MetricCard", () => {
  test("renders the value and 'Live' status when data is present", () => {
    const { container } = render(
      React.createElement(MetricCard, {
        id: "metric-aqi",
        title: "Air Quality",
        context: "AQI",
        value: 42,
        max: 300,
        status: baseStatus,
        gaugeLabel: "Air quality index",
        supportText: "Current AQI is 42 out of 300.",
      })
    );

    assert.ok(screen.getByText("Air Quality"));
    assert.ok(screen.getByText("Good"));
    assert.equal(
      container.querySelector(".metric-card--no-data"),
      null,
      "metric card should not carry the no-data modifier when value is finite"
    );
    assert.ok(container.querySelector(".metric-gauge-fill"));
  });

  test("renders the no-data modifier and 'No live data' pill when value is null", () => {
    const { container } = render(
      React.createElement(MetricCard, {
        id: "metric-aqi",
        title: "Air Quality",
        context: "AQI offline",
        value: null,
        max: 300,
        status: baseStatus,
        gaugeLabel: "Air quality index",
        supportText: "Air quality data is temporarily unavailable.",
      })
    );

    assert.ok(
      container.querySelector(".metric-card--no-data"),
      "metric card should carry the no-data modifier"
    );
    assert.ok(
      screen.getByText("No live data"),
      "missing-data pill should be visible"
    );
    assert.equal(
      container.querySelector(".metric-gauge-fill"),
      null,
      "gauge fill arc should not render when there is no value"
    );
    // Status label should not surface as a real reading; only the
    // missing pill should be visible.
    assert.equal(screen.queryByText("Good"), null);
  });

  test("treats undefined and empty-string values as missing", () => {
    for (const value of [undefined, ""]) {
      const { container, unmount } = render(
        React.createElement(MetricCard, {
          id: "metric-uv",
          title: "UV Index",
          context: "UV offline",
          value,
          max: 11,
          status: baseStatus,
          gaugeLabel: "UV index",
          supportText: "UV data is temporarily unavailable.",
        })
      );
      assert.ok(container.querySelector(".metric-card--no-data"));
      assert.ok(screen.getByText("No live data"));
      unmount();
    }
  });

  test("renders the help drawer trigger when helpText is provided", () => {
    render(
      React.createElement(MetricCard, {
        id: "metric-aqi",
        title: "Air Quality",
        context: "AQI",
        value: 42,
        max: 300,
        status: baseStatus,
        gaugeLabel: "Air quality index",
        supportText: "Current AQI is 42 out of 300.",
        helpTitle: "AQI scale explained",
        helpText: "AQI summarises air pollution levels.",
      })
    );

    assert.ok(screen.getByLabelText("About Air Quality"));
  });
});
