import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { analyzeNowcast } from "./analyzeNowcast.js";

// Naive 15-minute timestamps, exactly the shape Open-Meteo returns with
// timezone=auto. Parsing them and the injected `now` in the same frame
// keeps these assertions independent of the test machine's own zone.
const TIME = [
  "2026-04-21T18:00",
  "2026-04-21T18:15",
  "2026-04-21T18:30",
  "2026-04-21T18:45",
  "2026-04-21T19:00",
  "2026-04-21T19:15",
  "2026-04-21T19:30",
  "2026-04-21T19:45",
];

function atSlot(label) {
  return new Date(label).getTime();
}

describe("analyzeNowcast", () => {
  test("returns an unavailable shape when there are no time points", () => {
    const result = analyzeNowcast({ time: [] });
    assert.equal(result.hasData, false);
    assert.equal(result.startInMinutes, null);
  });

  test("anchors the window to an injected now (rain starting now)", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [80, 75, 0, 0, 0, 0, 0, 0],
        rainAmount: [0.1, 0.1, 0, 0, 0, 0, 0, 0],
        conditionCode: [61, 61, 3, 3, 3, 3, 3, 3],
      },
      { now: atSlot("2026-04-21T18:00") }
    );
    assert.equal(result.hasData, true);
    assert.equal(result.hasRain, true);
    assert.equal(result.startInMinutes, 0);
  });

  test("reports a future start when now lands mid-series", () => {
    // now = 18:30 -> window starts at index 2; the first wet slot is the
    // 19:00 entry (index 4), i.e. two 15-minute steps into the window.
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [0, 0, 0, 0, 90, 90, 0, 0],
        rainAmount: [0, 0, 0, 0, 0.2, 0.2, 0, 0],
        conditionCode: [3, 3, 3, 3, 61, 61, 3, 3],
      },
      { now: atSlot("2026-04-21T18:30") }
    );
    assert.equal(result.hasRain, true);
    assert.equal(result.startInMinutes, 30);
  });

  test("accepts a timeZone option without throwing", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [0, 0, 0, 0, 0, 0, 0, 0],
        rainAmount: [0, 0, 0, 0, 0, 0, 0, 0],
        conditionCode: [3, 3, 3, 3, 3, 3, 3, 3],
      },
      { timeZone: "Asia/Tokyo" }
    );
    assert.equal(typeof result.summary, "string");
  });

  test("marks the dry verdict as unverified when every probability is missing but codes are dry", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [null, null, null, null, null, null, null, null],
        rainAmount: [null, null, null, null, null, null, null, null],
        conditionCode: [3, 3, 3, 3, 3, 3, 3, 3],
      },
      { now: atSlot("2026-04-21T18:00") }
    );
    assert.equal(result.hasData, true);
    assert.equal(result.hasRain, false);
    assert.equal(result.probabilityAvailable, false);
    assert.equal(result.peakProbability, null);
  });

  test("keeps probabilityAvailable true and honest peak copy for a dry window with real low chances", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [5, 10, 15, 10, 5, 0, 0, 0],
        rainAmount: [0, 0, 0, 0, 0, 0, 0, 0],
        conditionCode: [3, 3, 3, 3, 3, 3, 3, 3],
      },
      { now: atSlot("2026-04-21T18:00") }
    );
    assert.equal(result.hasRain, false);
    assert.equal(result.probabilityAvailable, true);
    assert.equal(result.peakProbability, 15);
    // The old copy claimed the chance "stays below" its own computed peak.
    assert.doesNotMatch(result.details, /stays below/);
    assert.match(result.details, /reaches 15%/);
  });

  test("keeps missing probability slots as null in the chart series (no fake 0%)", () => {
    // A slot with no probability reading must not be drawn as a confident 0%;
    // it must reach the chart as null so the curve can gap there.
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [80, null, 60, 0, 0, 0, 0, 0],
        rainAmount: [0.1, 0.1, 0.1, 0, 0, 0, 0, 0],
        conditionCode: [61, 61, 61, 3, 3, 3, 3, 3],
      },
      { now: atSlot("2026-04-21T18:00") }
    );
    assert.equal(result.hasData, true);
    assert.equal(result.series[0], 80);
    assert.equal(result.series[1], null);
    assert.equal(result.series[2], 60);
  });
});
