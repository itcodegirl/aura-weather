import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup, fireEvent } = await import("@testing-library/react");
const ForecastCard = (await import("./ForecastCard.jsx")).default;

afterEach(() => {
  cleanup();
});

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIsoDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return toLocalDateString(today);
}

function renderForecastWithDaily(daily) {
  return render(
    React.createElement(ForecastCard, {
      unit: "F",
      weather: {
        daily: {
          time: [todayIsoDate()],
          conditionCode: [2],
          temperatureMax: [74],
          temperatureMin: [55],
          rainChanceMax: [20],
          ...daily,
        },
      },
    })
  );
}

function getTempValues(container) {
  return Array.from(container.querySelectorAll(".forecast-temp-value"));
}

describe("ForecastCard missing daily readings", () => {
  test("renders a missing daily high without appending a degree symbol", () => {
    const { container } = renderForecastWithDaily({
      temperatureMax: [null],
    });

    const [highValue, lowValue] = getTempValues(container);

    assert.ok(screen.getByLabelText("High unavailable"));
    assert.ok(screen.getByLabelText(/High unavailable, low 55 degrees/));
    assert.equal(highValue.textContent.trim(), "\u2014");
    assert.equal(highValue.classList.contains("is-missing"), true);
    assert.equal(lowValue.textContent.trim(), "55\u00B0");
    assert.equal(container.textContent.includes("\u2014\u00B0"), false);
  });

  test("renders a missing daily low without appending a degree symbol", () => {
    const { container } = renderForecastWithDaily({
      temperatureMin: [null],
    });

    const [highValue, lowValue] = getTempValues(container);

    assert.ok(screen.getByLabelText("Low unavailable"));
    assert.ok(screen.getByLabelText(/High 74 degrees, low unavailable/));
    assert.equal(highValue.textContent.trim(), "74\u00B0");
    assert.equal(lowValue.textContent.trim(), "\u2014");
    assert.equal(lowValue.classList.contains("is-missing"), true);
    assert.equal(container.textContent.includes("\u2014\u00B0"), false);
  });

  test("renders missing daily rain chance as unavailable, not low or zero", () => {
    const { container } = renderForecastWithDaily({
      rainChanceMax: [null],
    });

    assert.ok(screen.getByLabelText("Rain chance unavailable"));
    assert.equal(container.querySelector(".forecast-precip").textContent.trim(), "\u2014");
    assert.equal(container.textContent.includes("0%"), false);
  });

  test("reveals richer day details when a forecast row is expanded", () => {
    renderForecastWithDaily({
      sunrise: ["2026-05-12T05:41:00-05:00"],
      sunset: ["2026-05-12T20:03:00-05:00"],
      uvIndexMax: [7.1],
      windSpeedMax: [18],
      windGustMax: [27],
      windDirectionDominant: [235],
    });

    // Today's row auto-opens on mount; details are immediately visible.
    assert.ok(
      screen.getByRole("region", { name: "Today forecast details" })
    );
    assert.ok(screen.getByText("Peak UV"));
    assert.ok(screen.getByText("Sunrise"));
    assert.ok(screen.getByText("Sunset"));
    assert.ok(screen.getByText("SW 18 mph"));
    assert.ok(screen.getByText("Gusts 27 mph"));

    // The trigger now says "Hide" (pill label flips on expand).
    const trigger = screen.getByRole("button", {
      name: /hide forecast details for today/i,
    });
    fireEvent.click(trigger);
    assert.equal(
      screen.queryByRole("region", { name: "Today forecast details" }),
      null,
      "detail panel collapses on second click"
    );
  });
});

describe("ForecastCard derived-signal honesty", () => {
  test("a missing rain chance yields 'Partial data', not a fake 'Steady' all-clear", () => {
    // Three days so the null-rain day sits mid-range: in a single-day
    // week the day is automatically its own Warm Peak / Cool Dip.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const isoDates = [0, 1, 2].map((offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${month}-${day}`;
    });
    const { container } = renderForecastWithDaily({
      time: isoDates,
      conditionCode: [2, 2, 2],
      temperatureMax: [70, 74, 66],
      temperatureMin: [55, 52, 58],
      rainChanceMax: [null, 20, 20],
    });

    const chips = Array.from(
      container.querySelectorAll(".forecast-signal-chip")
    ).map((chip) => chip.textContent);
    // Row order matches the daily array; only the first day lacks rain
    // data. Days with real readings may still legitimately be "Steady".
    assert.equal(
      chips[0],
      "Partial data",
      "'Steady' is a claim about the day; missing rain data cannot support it"
    );
  });

  test("a week with no temperature mins never invents a 0° bound in the summary", () => {
    const { container } = renderForecastWithDaily({
      temperatureMax: [74],
      temperatureMin: [null],
    });

    const summary = container.querySelector(".forecast-summary");
    assert.ok(summary, "expected the week summary to render");
    assert.equal(
      summary.textContent.includes("0°"),
      false,
      `the old weekMin=0 fallback leaked a fake 0° reading; got: ${summary.textContent}`
    );
    assert.equal(
      summary.textContent.includes("— to —"),
      false,
      "an unavailable range should be omitted, not rendered as placeholder noise"
    );
  });
});
