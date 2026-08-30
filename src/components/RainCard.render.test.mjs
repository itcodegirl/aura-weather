import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup } = await import(
  "@testing-library/react"
);
const RainCard = (await import("./RainCard.jsx")).default;

afterEach(() => {
  cleanup();
});

function buildHourly(overrides = {}) {
  const start = new Date(Date.now() + 60_000);
  start.setSeconds(0, 0);
  const time = Array.from({ length: 24 }, (_, index) =>
    new Date(start.getTime() + index * 60 * 60 * 1000).toISOString()
  );

  return {
    time,
    rainChance: Array.from({ length: 24 }, () => 0),
    rainAmount: Array.from({ length: 24 }, () => 0),
    ...overrides,
  };
}

function getRainStatValue(label) {
  const labelEl = screen.getByText(label);
  const statEl = labelEl.closest(".rain-stat");
  return statEl?.querySelector(".rain-stat-value");
}

describe("RainCard missing precipitation accumulation", () => {
  test("does not turn unknown accumulation into a synthetic 0.00 total", () => {
    const { container } = render(
      React.createElement(RainCard, {
        weather: {
          hourly: buildHourly({
            rainAmount: Array.from({ length: 24 }, () => null),
          }),
        },
        unit: "F",
        dataUnit: "F",
      })
    );

    assert.equal(screen.queryByText("No meaningful rain expected"), null);
    assert.equal(getRainStatValue("Projected 24h total").textContent.trim(), "\u2014");
    assert.equal((container.textContent || "").includes("0.00 in"), false);
  });
});

function renderWithRainyHours() {
  // Build hours with enough rain signal to take the populated render
  // branch (avoids the "dry" / "no data" empty paths so the touch
  // explorer surfaces).
  const hourly = buildHourly({
    rainChance: Array.from({ length: 24 }, (_, i) => (i < 6 ? 70 + i : 30)),
    rainAmount: Array.from({ length: 24 }, (_, i) => (i < 6 ? 0.1 : 0.02)),
  });
  return render(
    React.createElement(RainCard, {
      weather: { hourly },
      unit: "F",
      dataUnit: "F",
    })
  );
}

describe("RainCard touch-sample announcement contract (mirrors HourlyCard)", () => {
  test("first render: no rain-touch-sample carries aria-current", () => {
    const { container } = renderWithRainyHours();
    const samples = container.querySelectorAll(".rain-touch-sample");
    if (samples.length === 0) return;
    for (const sample of samples) {
      assert.equal(
        sample.getAttribute("aria-current"),
        null,
        "no aria-current before user interaction"
      );
      assert.equal(
        sample.getAttribute("aria-pressed"),
        null,
        "must not use aria-pressed on the show-on-click samples"
      );
    }
  });

  test("after tapping a sample, exactly one carries aria-current=true", () => {
    const { container } = renderWithRainyHours();
    const samples = container.querySelectorAll(".rain-touch-sample");
    if (samples.length < 3) return;

    fireEvent.click(samples[2]);

    const updated = container.querySelectorAll(".rain-touch-sample");
    const currentCount = Array.from(updated).filter(
      (button) => button.getAttribute("aria-current") === "true"
    ).length;
    assert.equal(
      currentCount,
      1,
      "exactly one sample marked aria-current after a tap"
    );
    assert.equal(updated[2].getAttribute("aria-current"), "true");
  });

  test("selected-sample paragraph has no aria-live (button activation carries the announcement)", () => {
    const { container } = renderWithRainyHours();
    const region = container.querySelector(".rain-selected-sample");
    if (!region) return;
    assert.equal(
      region.getAttribute("aria-live"),
      null,
      "must not duplicate the button-press announcement via a live region"
    );
  });

  test("sample button aria-label reads 'Show' rather than 'Select'", () => {
    const { container } = renderWithRainyHours();
    const samples = container.querySelectorAll(".rain-touch-sample");
    if (samples.length === 0) return;
    const label = samples[0].getAttribute("aria-label") || "";
    assert.ok(
      label.startsWith("Show "),
      `expected label to start with "Show", got: ${JSON.stringify(label)}`
    );
  });

  test("chart mode toggle correctly keeps aria-pressed (it IS a toggle)", () => {
    // Sanity check: the mode toggle buttons (% vs in/mm) genuinely toggle
    // a state, so aria-pressed is the right semantic there \u2014 unlike the
    // touch samples which "show" a value rather than "toggle on".
    const { container } = renderWithRainyHours();
    const modeButtons = container.querySelectorAll(".rain-mode-btn");
    assert.equal(modeButtons.length, 2);
    const pressedCount = Array.from(modeButtons).filter(
      (button) => button.getAttribute("aria-pressed") === "true"
    ).length;
    assert.equal(
      pressedCount,
      1,
      "exactly one mode toggle button reports aria-pressed=true at any moment"
    );
  });
});

describe("RainCard amount-mode per-hour readout (with running total as context)", () => {
  function renderAndSwitchToInches() {
    // Constant per-hour amount: each chip should read the same per-hour
    // value, while the "total so far" context climbs across the row.
    const hourly = buildHourly({
      rainChance: Array.from({ length: 24 }, () => 60),
      rainAmount: Array.from({ length: 24 }, () => 0.05),
    });
    const view = render(
      React.createElement(RainCard, {
        weather: { hourly },
        unit: "F",
        dataUnit: "F",
      })
    );
    const inBtn = [...view.container.querySelectorAll(".rain-mode-btn")].find(
      (b) => b.textContent.trim() === "in"
    );
    fireEvent.click(inBtn);
    return view;
  }

  test("each chip shows that hour's own amount, not a plateauing running total", () => {
    const { container } = renderAndSwitchToInches();
    const samples = [...container.querySelectorAll(".rain-touch-sample")];
    if (samples.length < 4) return;

    const chipValue = (sample) =>
      sample.querySelector("strong")?.textContent || "";

    // 0.05 in/hr constant: every chip reads the per-hour amount (0.05),
    // rather than a cumulative total that would climb/plateau across the row.
    assert.equal(chipValue(samples[0]), "0.05 in");
    assert.equal(chipValue(samples[1]), "0.05 in");
    assert.equal(chipValue(samples[3]), "0.05 in");
  });

  test("readout headline shows the per-hour amount, with running total as context", () => {
    const { container } = renderAndSwitchToInches();
    const samples = container.querySelectorAll(".rain-touch-sample");
    if (samples.length < 4) return;

    const headline = () =>
      container.querySelector(".rain-selected-sample strong")?.textContent || "";
    const context = () =>
      container.querySelector(".rain-selected-sample span:last-child")
        ?.textContent || "";

    fireEvent.click(samples[0]);
    assert.equal(headline(), "0.05 in", "headline is the per-hour amount");
    assert.match(
      context(),
      /total so far/,
      "secondary line labels the running total as 'total so far'"
    );
    assert.match(context(), /0\.05 in total so far/, "running total is shown as context");

    fireEvent.click(samples[3]);
    assert.equal(headline(), "0.05 in", "per-hour amount stays constant across hours");
    assert.match(
      context(),
      /0\.20 in total so far/,
      "running-total context grows for later hours"
    );
  });

  test("running-total context at the final hour equals the projected 24h total", () => {
    const { container } = renderAndSwitchToInches();
    const samples = container.querySelectorAll(".rain-touch-sample");
    if (samples.length === 0) return;

    fireEvent.click(samples[samples.length - 1]);
    const context =
      container.querySelector(".rain-selected-sample span:last-child")
        ?.textContent || "";
    const projected = getRainStatValue("Projected 24h total").textContent.trim();

    assert.match(
      context,
      new RegExp(`${projected.replace(/\./g, "\\.")} total so far`),
      `final running total context "${context}" should include projected total "${projected}"`
    );
  });
});

describe("RainCard rain-total provenance qualifiers", () => {
  function renderInInchesMode(hourly) {
    const view = render(
      React.createElement(RainCard, {
        weather: { hourly },
        unit: "F",
        dataUnit: "F",
      })
    );
    const inBtn = [...view.container.querySelectorAll(".rain-mode-btn")].find(
      (b) => b.textContent.trim() === "in"
    );
    fireEvent.click(inBtn);
    return view;
  }

  test("a gapped series qualifies the running total as a floor, visibly and in aria", () => {
    // Slot 2 is a provider gap: it folds into the running sum as 0, so
    // every total from that hour on is a floor, not an exact value.
    const { container } = renderInInchesMode(
      buildHourly({
        rainChance: Array.from({ length: 24 }, (_, i) => (i === 2 ? null : 60)),
        rainAmount: Array.from({ length: 24 }, (_, i) => (i === 2 ? null : 0.05)),
      })
    );
    const samples = [...container.querySelectorAll(".rain-touch-sample")];
    assert.ok(samples.length >= 6, "expected the full 24-sample strip");

    const context = () =>
      container.querySelector(".rain-selected-sample span:last-child")
        ?.textContent || "";

    // Hours 0,1,3,4,5 contribute 0.05 each = 0.25, with the gap folded as 0.
    fireEvent.click(samples[5]);
    assert.equal(context(), "≥ 0.25 in total so far");
    assert.match(
      samples[5].getAttribute("aria-label") || "",
      /at least 0\.25 in total so far/,
      "aria mirror of a gapped running total must say 'at least'"
    );

    // Before the gap the sum is complete, so no qualifier applies.
    fireEvent.click(samples[1]);
    assert.equal(context(), "0.10 in total so far");
    assert.doesNotMatch(
      samples[1].getAttribute("aria-label") || "",
      /at least/,
      "totals from complete prefixes stay unqualified"
    );
  });

  test("a complete series renders no floor qualifier anywhere", () => {
    const { container } = renderInInchesMode(
      buildHourly({
        rainChance: Array.from({ length: 24 }, () => 60),
        rainAmount: Array.from({ length: 24 }, () => 0.05),
      })
    );

    assert.equal((container.textContent || "").includes("≥"), false);
    const qualifiedLabels = [
      ...container.querySelectorAll(".rain-touch-sample"),
    ].filter((sample) =>
      (sample.getAttribute("aria-label") || "").includes("at least")
    );
    assert.equal(qualifiedLabels.length, 0);
  });

  function buildHourlyWithHistory(pastHours) {
    const start = new Date(Date.now() + 60_000);
    start.setSeconds(0, 0);
    const length = pastHours + 24;
    const time = Array.from({ length }, (_, index) =>
      new Date(start.getTime() + (index - pastHours) * 60 * 60 * 1000).toISOString()
    );
    return {
      time,
      rainChance: Array.from({ length }, () => 60),
      rainAmount: Array.from({ length }, () => 0.05),
    };
  }

  function getHistoryPill(container, label) {
    return [...container.querySelectorAll(".rain-history-pill")].find(
      (pill) =>
        pill.querySelector(".rain-history-pill-label")?.textContent === label
    );
  }

  test("a short-history 48h pill discloses how many hours actually back it", () => {
    const { container } = render(
      React.createElement(RainCard, {
        weather: { hourly: buildHourlyWithHistory(36) },
        unit: "F",
        dataUnit: "F",
      })
    );

    const pill48 = getHistoryPill(container, "48h");
    assert.equal(
      pill48?.querySelector(".rain-history-pill-note")?.textContent.trim(),
      "36h of data"
    );
    // Fully-served windows carry no note.
    const pill24 = getHistoryPill(container, "24h");
    assert.equal(pill24?.querySelector(".rain-history-pill-note"), null);
  });

  test("full 48h of history renders no coverage note", () => {
    const { container } = render(
      React.createElement(RainCard, {
        weather: { hourly: buildHourlyWithHistory(48) },
        unit: "F",
        dataUnit: "F",
      })
    );

    assert.equal(container.querySelector(".rain-history-pill-note"), null);
  });

  test("the past totals are labeled as modeled, not observed", () => {
    renderWithRainyHours();
    assert.equal(screen.queryByText("Observed today"), null);
    assert.ok(getRainStatValue("Modeled so far today"));
  });
});

describe("RainCard roving tabindex + valid strip role", () => {
  test("exactly one chart bar is a tab stop, and ArrowRight moves it forward", () => {
    const { container } = renderWithRainyHours();
    const bars = [...container.querySelectorAll(".rain-bar")];
    if (bars.length < 2) return;

    assert.equal(
      bars.filter((button) => button.tabIndex === 0).length,
      1,
      "the ~24 rain chart bars should expose one tab stop, not one per hour"
    );

    const beforeIdx = bars.findIndex((button) => button.tabIndex === 0);
    fireEvent.keyDown(bars[beforeIdx], { key: "ArrowRight" });

    const updated = [...container.querySelectorAll(".rain-bar")];
    assert.equal(
      updated.filter((button) => button.tabIndex === 0).length,
      1,
      "still exactly one chart tab stop after arrowing"
    );
    assert.equal(
      updated.findIndex((button) => button.tabIndex === 0),
      Math.min(beforeIdx + 1, updated.length - 1),
      "ArrowRight moves the chart tab stop one hour forward"
    );
  });

  test("exactly one touch-sample is a tab stop (the strip roves too)", () => {
    const { container } = renderWithRainyHours();
    const samples = [...container.querySelectorAll(".rain-touch-sample")];
    if (samples.length < 2) return;
    assert.equal(
      samples.filter((button) => button.tabIndex === 0).length,
      1,
      "the sample strip should expose one tab stop, not one per hour"
    );
  });

  test("the sample strip uses role=group, not the invalid role=list with button children", () => {
    const { container } = renderWithRainyHours();
    const strip = container.querySelector(".rain-touch-strip");
    if (!strip) return;
    assert.equal(strip.getAttribute("role"), "group");
    assert.equal(
      container.querySelector('.rain-touch-strip[role="list"]'),
      null,
      "role=list with direct button children is invalid ARIA (list requires listitem children)"
    );
  });
});
