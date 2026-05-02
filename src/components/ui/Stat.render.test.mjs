import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const Stat = (await import("./Stat.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("Stat", () => {
  test("renders the value as-is for a real reading", () => {
    render(
      React.createElement(Stat, {
        label: "Humidity",
        value: "62%",
      })
    );

    assert.ok(screen.getByText("Humidity"));
    assert.ok(screen.getByText("62%"));
    assert.equal(
      screen.queryByLabelText("No data available"),
      null,
      "real readings must not announce as missing data"
    );
  });

  test("auto-detects the em-dash placeholder and applies the missing modifier", () => {
    const { container } = render(
      React.createElement(Stat, {
        label: "Pressure",
        value: "—",
      })
    );

    const valueEl = container.querySelector(".stat-value");
    assert.ok(valueEl, "value element renders");
    assert.ok(
      valueEl.classList.contains("is-missing"),
      "stat value carries the .is-missing modifier"
    );
    assert.ok(
      screen.getByLabelText("No data available"),
      "screen reader hears 'No data available' instead of 'em dash'"
    );
  });

  test("respects an explicit missing prop when value is non-em-dash", () => {
    const { container } = render(
      React.createElement(Stat, {
        label: "Pressure",
        value: "1014 hPa",
        missing: true,
      })
    );

    const valueEl = container.querySelector(".stat-value");
    assert.ok(valueEl.classList.contains("is-missing"));
    assert.ok(screen.getByLabelText("No data available"));
  });

  test("never announces missing for a real numeric value with the explicit missing=false override", () => {
    const { container } = render(
      React.createElement(Stat, {
        label: "Wind",
        value: "—",
        missing: false,
      })
    );

    const valueEl = container.querySelector(".stat-value");
    assert.equal(valueEl.classList.contains("is-missing"), false);
    assert.equal(screen.queryByLabelText("No data available"), null);
  });
});
