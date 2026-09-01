import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup } = await import("@testing-library/react");
const ForecastCard = (await import("../ForecastCard.jsx")).default;
const { buildHeroData } = await import("./buildHeroData.js");

afterEach(() => {
  cleanup();
});

/*
 * Audit finding 26. The hero read `weather.daily.*[0]` while ForecastCard
 * filters its rows to `date >= today` in the location's timezone. Those agree
 * on a fresh fetch and diverge on a restored one, so the two panels stated
 * different values for the same day.
 *
 * This drives both real surfaces rather than testing resolveTodayIndex twice:
 * the guarantee that matters is that the hero and the Week Ahead agree, and
 * only rendering ForecastCard proves its half. Real dates are used because
 * ForecastCard reads the clock through useTimeNow, which these tests do not
 * mock — so "today" here is genuinely today.
 */
function isoDaysFromToday(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// A snapshot captured yesterday: it still carries yesterday at index 0.
const STALE_DAILY = {
  time: [isoDaysFromToday(-1), isoDaysFromToday(0), isoDaysFromToday(1)],
  conditionCode: [0, 61, 0],
  temperatureMax: [50, 80, 82],
  temperatureMin: [40, 60, 62],
  rainChanceMax: [10, 90, 20],
  rainAmountTotal: [0, 1.2, 0],
  uvIndexMax: [1, 9, 9],
  sunrise: [
    `${isoDaysFromToday(-1)}T06:00`,
    `${isoDaysFromToday(0)}T06:05`,
    `${isoDaysFromToday(1)}T06:06`,
  ],
  sunset: [
    `${isoDaysFromToday(-1)}T20:00`,
    `${isoDaysFromToday(0)}T19:58`,
    `${isoDaysFromToday(1)}T19:56`,
  ],
};

function heroFor(daily) {
  return buildHeroData({
    weather: {
      meta: {},
      current: {
        temperature: 70,
        feelsLike: 70,
        dewPoint: 50,
        conditionCode: 0,
      },
      daily,
    },
    location: { name: "Testville", country: "Nowhere", lat: 0, lon: 0 },
    unit: "F",
    nowMs: Date.now(),
  });
}

function firstForecastRowTemps(daily) {
  const { container } = render(
    React.createElement(ForecastCard, {
      unit: "F",
      weather: { meta: {}, daily },
    })
  );
  const values = Array.from(
    container.querySelectorAll(".forecast-temp-value")
  ).map((node) => node.textContent.trim());
  return { high: values[0], low: values[1] };
}

describe("the hero and the Week Ahead agree on today", () => {
  test("a snapshot restored from yesterday does not split the two panels", () => {
    const hero = heroFor(STALE_DAILY);
    const firstRow = firstForecastRowTemps(STALE_DAILY);

    assert.equal(
      hero.todayHighDisplay,
      "80°F",
      "the hero reports today's high, not the stale index 0"
    );
    assert.equal(hero.todayLowDisplay, "60°F");
    // The claim that matters: the same number in both places.
    assert.equal(firstRow.high, "80°");
    assert.equal(firstRow.low, "60°");
  });

  test("the UV peak agrees too, which is the reading that can mislead", () => {
    // The stale index 0 has a peak of 1, which renders as "no special
    // protection required" over a day whose real peak is 9 (Very High).
    const hero = heroFor(STALE_DAILY);

    assert.equal(hero.uvPanel?.peak, 9);
    assert.doesNotMatch(
      JSON.stringify(hero.uvPanel),
      /no special protection/i,
      "a Very High day must not be described as needing no protection"
    );
  });

  test("a fresh forecast is unaffected", () => {
    const freshDaily = {
      ...STALE_DAILY,
      time: [isoDaysFromToday(0), isoDaysFromToday(1), isoDaysFromToday(2)],
    };
    const hero = heroFor(freshDaily);
    const firstRow = firstForecastRowTemps(freshDaily);

    // Index 0 is today here, so both panels read the first entry.
    assert.equal(hero.todayHighDisplay, "50°F");
    assert.equal(firstRow.high, "50°");
  });
});
