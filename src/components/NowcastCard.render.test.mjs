import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const NowcastCard = (await import("./NowcastCard.jsx")).default;
const { analyzeNowcast } = await import("./nowcast/analyzeNowcast.js");

afterEach(() => {
  cleanup();
});

function buildNowcast(overrides = {}) {
  const start = new Date(Date.now() + 60_000);
  start.setSeconds(0, 0);
  const time = Array.from({ length: 8 }, (_, index) =>
    new Date(start.getTime() + index * 15 * 60 * 1000).toISOString()
  );

  return {
    time,
    rainChance: Array.from({ length: 8 }, () => 0),
    rainAmount: Array.from({ length: 8 }, () => 0),
    conditionCode: Array.from({ length: 8 }, () => 0),
    ...overrides,
  };
}

describe("analyzeNowcast", () => {
  test("keeps real zero nowcast readings as a valid dry window", () => {
    const analysis = analyzeNowcast(buildNowcast());

    assert.equal(analysis.hasData, true);
    assert.equal(analysis.hasRain, false);
    assert.equal(analysis.probabilityAvailable, true);
    assert.equal(analysis.peakProbability, 0);
    assert.match(analysis.details, /0%/);
  });

  test("treats all-null nowcast readings as unavailable", () => {
    const analysis = analyzeNowcast(
      buildNowcast({
        rainChance: Array.from({ length: 8 }, () => null),
        rainAmount: Array.from({ length: 8 }, () => null),
        conditionCode: Array.from({ length: 8 }, () => null),
      })
    );

    assert.equal(analysis.hasData, false);
    assert.equal(analysis.hasRain, false);
    assert.equal(analysis.peakProbability, null);
    assert.match(analysis.details, /missing from the provider/);
  });

  test("keeps missing precipitation chance unknown when weather codes are dry", () => {
    const analysis = analyzeNowcast(
      buildNowcast({
        rainChance: Array.from({ length: 8 }, () => null),
        rainAmount: Array.from({ length: 8 }, () => null),
        conditionCode: Array.from({ length: 8 }, () => 0),
      })
    );

    assert.equal(analysis.hasData, true);
    assert.equal(analysis.hasRain, false);
    assert.equal(analysis.probabilityAvailable, false);
    assert.equal(analysis.peakProbability, null);
    assert.match(analysis.details, /Rain chance is unavailable/);
  });
});

describe("NowcastCard", () => {
  test("renders missing nowcast samples as offline instead of 0%", () => {
    render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: Array.from({ length: 8 }, () => null),
            rainAmount: Array.from({ length: 8 }, () => null),
            conditionCode: Array.from({ length: 8 }, () => null),
          }),
        },
      })
    );

    // Badge: now reads "Reading unavailable" in the user-honest voice
    // (was "Nowcast offline"). The trailing meta line that previously
    // re-stated the offline status has been removed because the badge
    // + the analyzer's explanatory copy already convey the state.
    assert.equal(screen.getAllByText("Reading unavailable").length, 1);
    assert.equal(
      screen.queryByText("Nowcast offline"),
      null,
      "engineering phrase must not appear anywhere"
    );
    assert.ok(screen.getByText("Nowcast data is unavailable."));
    assert.ok(screen.getByText("15-minute precipitation readings are missing from the provider."));
    assert.ok(screen.getAllByText("\u2014").length >= 2);
    assert.equal(screen.queryByText("0%"), null);
  });

  test("does not render a redundant 'Short-range precipitation guidance' meta line on the populated path", () => {
    // Phase 18 cleanup: the explainer at the top of the card already
    // says "15-minute rain guidance over the next 2 hours.", so a
    // trailing meta line repeating the same idea was visual noise.
    const { container } = render(
      React.createElement(NowcastCard, {
        weather: { nowcast: buildNowcast() },
      })
    );
    assert.equal(
      container.querySelector(".nowcast-meta"),
      null,
      "no .nowcast-meta element should render \u2014 the trailing meta line is removed"
    );
    assert.equal(
      screen.queryByText("Short-range precipitation guidance"),
      null
    );
  });

  test("qualifies the dry badge and chip when no probability backed the verdict", () => {
    // The badge/chip must not claim certainty ("Dry window") that the
    // details sentence withdraws when every probability slot was null.
    render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: Array.from({ length: 8 }, () => null),
            rainAmount: Array.from({ length: 8 }, () => null),
            conditionCode: Array.from({ length: 8 }, () => 0),
          }),
        },
      })
    );

    const badge = screen.getByText("Likely dry");
    assert.ok(
      badge.classList.contains("severity-badge--partial"),
      "unverified dry badge must use the partial severity tone"
    );
    assert.equal(screen.queryByText("Dry window"), null);
    assert.equal(
      screen.getByText("Duration").nextElementSibling.textContent.trim(),
      "Likely dry 2h"
    );
    assert.ok(screen.getByText("Rain chance is unavailable, but no wet weather code or accumulation was returned."));
    assert.equal(screen.getByText("Peak chance").nextElementSibling.textContent.trim(), "\u2014");
    assert.equal(screen.queryByText("0%"), null);
  });

  test("keeps the unqualified dry language when real probabilities back the verdict", () => {
    render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: Array.from({ length: 8 }, () => 5),
          }),
        },
      })
    );

    const badge = screen.getByText("Dry window");
    assert.ok(
      badge.classList.contains("severity-badge--minimal"),
      "probability-backed dry badge keeps the minimal tone"
    );
    assert.equal(screen.queryByText("Likely dry"), null);
    assert.equal(
      screen.getByText("Duration").nextElementSibling.textContent.trim(),
      "Dry 2h"
    );
  });
});

describe("NowcastCard chart text equivalent", () => {
  function getChartDescription(container) {
    const section = container.querySelector(".nowcast-card");
    const id = section.getAttribute("aria-describedby");
    assert.ok(id, "the labelled region must point at a description");
    const description = container.querySelector(`[id="${id}"]`);
    assert.ok(description, "aria-describedby must resolve to a rendered element");
    assert.ok(
      description.classList.contains("sr-only"),
      "the chart's text equivalent is screen-reader-only"
    );
    return description.textContent.trim();
  }

  test("describes the threshold crossing with the same numbers as the chips", () => {
    const { container } = render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: [10, 20, 40, 60, 80, 70, 55, 30],
            conditionCode: [1, 1, 51, 61, 61, 61, 51, 2],
          }),
        },
      })
    );

    const text = getChartDescription(container);
    assert.equal(
      text,
      "Rain chance crosses the 50% rain-likely line about 45 minutes from now, peaking at 80%, rising into the second hour."
    );
    // The spoken peak is the Peak chance chip's own number, so the drawn and
    // spoken versions cannot disagree.
    assert.equal(
      screen.getByText("Peak chance").nextElementSibling.textContent.trim(),
      "80%"
    );
    // The SVG itself stays hidden — the paragraph is its equivalent.
    assert.equal(
      container.querySelector(".nowcast-svg").getAttribute("aria-hidden"),
      "true"
    );
  });

  test("describes a dry window as staying below the line without inventing timing", () => {
    const { container } = render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({ rainChance: [5, 5, 10, 8, 6, 4, 5, 3] }),
        },
      })
    );

    const text = getChartDescription(container);
    assert.equal(
      text,
      "Rain chance stays below the 50% rain-likely line for the next 2 hours, peaking at 10%, holding flat across the window."
    );
    assert.doesNotMatch(text, /crosses the/i);
    assert.doesNotMatch(text, /minute/i, "a dry window has no crossing time to announce");
  });

  test("reports the missing reading instead of describing a curve", () => {
    // The qualified "Likely dry" path: weather codes are dry but no
    // probability slot has a value, so there is no curve to draw or describe.
    const { container } = render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: Array.from({ length: 8 }, () => null),
            rainAmount: Array.from({ length: 8 }, () => null),
            conditionCode: Array.from({ length: 8 }, () => 0),
          }),
        },
      })
    );

    const text = getChartDescription(container);
    assert.equal(
      text,
      "Rain chance readings for the next 2 hours are unavailable, so the chart has no curve to describe."
    );
    assert.doesNotMatch(text, /rain-likely line/);
    assert.doesNotMatch(text, /peaking|rising|falling|holding flat/);
    assert.doesNotMatch(text, /\d+%/, "no percentage may be spoken for a missing reading");
    assert.ok(screen.getByText("Likely dry"));
  });

  test("reports the missing reading when the whole nowcast window is unavailable", () => {
    const { container } = render(
      React.createElement(NowcastCard, {
        weather: {
          nowcast: buildNowcast({
            rainChance: Array.from({ length: 8 }, () => null),
            rainAmount: Array.from({ length: 8 }, () => null),
            conditionCode: Array.from({ length: 8 }, () => null),
          }),
        },
      })
    );

    assert.equal(
      getChartDescription(container),
      "Rain chance readings for the next 2 hours are unavailable, so the chart has no curve to describe."
    );
  });
});
