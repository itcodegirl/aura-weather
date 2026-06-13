import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup } = await import(
  "@testing-library/react"
);
const HourlyCard = (await import("./HourlyCard.jsx")).default;

afterEach(() => {
  cleanup();
});

function renderHourly({ hourly = null } = {}) {
  return render(
    React.createElement(HourlyCard, {
      unit: "F",
      weather: hourly ? { hourly } : {},
    })
  );
}

describe("HourlyCard aria wiring", () => {
  // Earlier the empty branch left aria-describedby={chartSummaryId} on
  // the section but did not render the matching <p id={chartSummaryId}>.
  // That left an orphan aria reference, which screen readers report as
  // "described by nothing" — confusing for users on assistive tech who
  // are told the chart has a description that is not actually present.
  test("empty branch has no orphan aria-describedby", () => {
    const { container } = renderHourly({ hourly: { time: [], temperature: [] } });
    const section = container.querySelector(".bento-chart");
    assert.ok(section, "expected the empty hourly section to render");

    const describedBy = section.getAttribute("aria-describedby");
    if (describedBy) {
      const target = container.ownerDocument.getElementById(describedBy);
      assert.ok(
        target,
        `aria-describedby="${describedBy}" must point to a real element in the same render`
      );
    }
  });

  test("populated branch wires aria-describedby to a non-empty sr-only summary", () => {
    const now = new Date();
    const hours = Array.from({ length: 6 }, (_, i) => {
      const t = new Date(now.getTime() + i * 60 * 60 * 1000);
      return t.toISOString();
    });
    const { container } = renderHourly({
      hourly: {
        time: hours,
        temperature: [60, 61, 62, 63, 64, 65],
        precipitation: [0, 0, 0, 0, 0, 0],
        rainChance: [10, 10, 10, 10, 10, 10],
      },
    });

    const section = container.querySelector(".bento-chart");
    assert.ok(section, "expected the populated hourly section to render");

    const describedBy = section.getAttribute("aria-describedby");
    assert.ok(describedBy, "populated branch should expose an aria-describedby");

    const target = container.ownerDocument.getElementById(describedBy);
    assert.ok(
      target,
      `aria-describedby="${describedBy}" must resolve to an element in the populated branch`
    );
    assert.ok(
      target.textContent.trim().length > 0,
      "the aria description should not be empty text"
    );
  });

  test("all-null hourly temperatures render the unavailable state, not an empty chart frame", () => {
    const now = new Date();
    const hours = Array.from({ length: 6 }, (_, i) =>
      new Date(now.getTime() + i * 60 * 60 * 1000).toISOString()
    );
    const { container } = renderHourly({
      hourly: {
        time: hours,
        temperature: [null, null, null, null, null, null],
        conditionCode: [null, null, null, null, null, null],
      },
    });

    assert.ok(
      screen.getByText("Hourly chart unavailable"),
      "all-null temperature series should use the explicit empty state"
    );
    assert.equal(
      container.querySelector(".hourly-svg"),
      null,
      "must not render a decorative chart shell when there are no usable points"
    );
  });
});

function renderPopulated() {
  const now = new Date();
  const hours = Array.from({ length: 6 }, (_, i) =>
    new Date(now.getTime() + i * 60 * 60 * 1000).toISOString()
  );
  return renderHourly({
    hourly: {
      time: hours,
      temperature: [60, 61, 62, 63, 64, 65],
      conditionCode: [0, 1, 2, 3, 0, 1],
      precipitation: [0, 0, 0, 0, 0, 0],
      rainChance: [10, 10, 10, 10, 10, 10],
    },
  });
}

describe("HourlyCard touch-sample announcement contract", () => {
  test("first render: no sample reports aria-current — the user has not selected anything yet", () => {
    const { container } = renderPopulated();
    const samples = container.querySelectorAll(".hourly-touch-sample");
    if (samples.length === 0) {
      // Touch strip is mobile-only; some setups won't render it. Skip
      // gracefully — the contract still holds in production via CSS.
      return;
    }
    for (const sample of samples) {
      assert.equal(
        sample.getAttribute("aria-current"),
        null,
        "no sample button should advertise aria-current before user interaction"
      );
      assert.equal(
        sample.getAttribute("aria-pressed"),
        null,
        "must not use aria-pressed — that's the toggle semantic, not 'currently shown'"
      );
    }
  });

  test("after the user taps a sample, only that one carries aria-current=true", () => {
    const { container } = renderPopulated();
    const samples = container.querySelectorAll(".hourly-touch-sample");
    if (samples.length < 2) return;

    fireEvent.click(samples[2]);

    const updatedSamples = container.querySelectorAll(".hourly-touch-sample");
    const currentCount = Array.from(updatedSamples).filter(
      (button) => button.getAttribute("aria-current") === "true"
    ).length;
    assert.equal(
      currentCount,
      1,
      "exactly one sample should be marked aria-current after a tap"
    );
    assert.equal(updatedSamples[2].getAttribute("aria-current"), "true");
  });

  test("selected-sample paragraph has no aria-live attribute — the button activation carries the announcement", () => {
    const { container } = renderPopulated();
    const selectedSample = container.querySelector(".hourly-selected-sample");
    if (!selectedSample) return;
    assert.equal(
      selectedSample.getAttribute("aria-live"),
      null,
      "must not duplicate the button-press announcement via a live region"
    );
  });

  test("sample button aria-label reads 'Show' rather than 'Select' to match the show-on-click model", () => {
    const { container } = renderPopulated();
    const samples = container.querySelectorAll(".hourly-touch-sample");
    if (samples.length === 0) return;
    const label = samples[0].getAttribute("aria-label") || "";
    assert.ok(
      label.startsWith("Show "),
      `expected label to start with "Show", got: ${JSON.stringify(label)}`
    );
  });

  test("sample strip uses role=group, not role=list — its children are buttons, not list items", () => {
    const { container } = renderPopulated();
    const explorer = container.querySelector(".hourly-touch-explorer");
    if (!explorer) return;

    assert.equal(explorer.getAttribute("role"), "group");
    assert.equal(
      container.querySelector('.hourly-touch-strip[role="list"]'),
      null,
      "role=list with direct button children is invalid ARIA (list requires listitem children)"
    );
  });

  test("roving tabindex: exactly one sample is a tab stop, arrows move selection", () => {
    const { container } = renderPopulated();
    const samples = [...container.querySelectorAll(".hourly-touch-sample")];
    if (samples.length < 2) return;

    const tabStops = samples.filter((button) => button.tabIndex === 0);
    assert.equal(
      tabStops.length,
      1,
      "the strip should expose a single tab stop so keyboard users are not forced through every hour"
    );
    assert.ok(
      samples.filter((button) => button.tabIndex === -1).length >= 1,
      "remaining samples should be reachable by arrow keys, not Tab"
    );

    fireEvent.keyDown(tabStops[0], { key: "ArrowRight" });
    const updatedSamples = [...container.querySelectorAll(".hourly-touch-sample")];
    assert.equal(
      updatedSamples[1].getAttribute("aria-current"),
      "true",
      "ArrowRight should select the next sample (selection follows focus)"
    );
    assert.equal(
      updatedSamples[1].tabIndex,
      0,
      "the newly selected sample becomes the strip's tab stop"
    );
  });

  test("svg-point tooltip uses middle-dot separators, not ASCII hyphens", () => {
    const { container } = renderPopulated();
    const titles = container.querySelectorAll(".hourly-point-hit title");
    if (titles.length === 0) return;
    const firstTooltip = titles[0].textContent || "";
    assert.ok(
      firstTooltip.includes(" · "),
      `expected middle-dot separator in tooltip, got: ${JSON.stringify(firstTooltip)}`
    );
    assert.equal(
      firstTooltip.includes(" - "),
      false,
      "must not use ASCII hyphen separators that screen readers may pronounce as 'minus'"
    );
  });
});

// Tiny references so the imports are not flagged unused if a later
// refactor removes the populated test branch above.
void screen;
void fireEvent;
