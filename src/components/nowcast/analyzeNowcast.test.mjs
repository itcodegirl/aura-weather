import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeNowcast,
  describeNowcastDuration,
  describeNowcastStart,
} from "./analyzeNowcast.js";

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

describe("how precisely the nowcast is allowed to speak", () => {
  /*
   * The series is `minutely_15.precipitation_probability`: a chance of rain,
   * sampled every quarter hour. A threshold crossing at slot N is not rain
   * beginning at N x 15 minutes, so the copy must not name a minute. These
   * fail against the old wording, which read
   * "Moderate rain starting in 15 minutes, lasting ~30 minutes".
   */

  test("start buckets round to boundaries a chance series can support", () => {
    assert.deepEqual(describeNowcastStart(0), { maxMinutes: 0, tile: "Now", phrase: "now" });
    assert.equal(describeNowcastStart(15).tile, "< 30 min");
    assert.equal(describeNowcastStart(30).tile, "< 30 min");
    assert.equal(describeNowcastStart(45).tile, "< 1 hr");
    assert.equal(describeNowcastStart(60).tile, "< 1 hr");
    assert.equal(describeNowcastStart(75).tile, "1-2 hr");
    assert.equal(describeNowcastStart(120).tile, "1-2 hr");
  });

  test("duration buckets do the same", () => {
    assert.equal(describeNowcastDuration(15).phrase, "passing quickly");
    assert.equal(describeNowcastDuration(30).phrase, "passing quickly");
    assert.equal(describeNowcastDuration(45).phrase, "lasting about an hour");
    assert.equal(describeNowcastDuration(60).phrase, "lasting about an hour");
    assert.equal(
      describeNowcastDuration(90).phrase,
      "lasting through most of the window"
    );
  });

  test("an unusable minute count still lands in a bucket, never undefined", () => {
    for (const value of [null, undefined, Number.NaN, -30, "45"]) {
      assert.equal(typeof describeNowcastStart(value).tile, "string");
      assert.equal(typeof describeNowcastDuration(value).phrase, "string");
    }
  });

  test("the summary names no minute count", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [5, 10, 70, 80, 75, 20, 10, 5],
        rainAmount: [0, 0, 0.4, 0.6, 0.5, 0, 0, 0],
        conditionCode: [2, 2, 61, 61, 61, 2, 2, 2],
      },
      { now: atSlot("2026-04-21T18:00") }
    );

    assert.equal(result.hasRain, true);
    // Positive control: the raw figures are still computed and exposed, so a
    // pass here cannot come from the analysis having quietly stopped working.
    assert.equal(result.startInMinutes, 30);
    assert.equal(result.durationMinutes, 45);

    // The sentence built from them says neither number.
    assert.ok(
      !/\d+\s*min/i.test(result.summary),
      `summary should not name a minute count, got: ${result.summary}`
    );
    assert.equal(
      result.summary,
      "Heavy rain likely within the next half hour, lasting about an hour"
    );
  });

  test("rain already under way reads as now, not as a countdown", () => {
    const result = analyzeNowcast(
      {
        time: TIME,
        rainChance: [80, 75, 70, 10, 5, 5, 5, 5],
        rainAmount: [0.6, 0.5, 0.4, 0, 0, 0, 0, 0],
        conditionCode: [61, 61, 61, 2, 2, 2, 2, 2],
      },
      { now: atSlot("2026-04-21T18:00") }
    );
    assert.equal(result.startInMinutes, 0);
    assert.ok(result.summary.startsWith("Heavy rain likely now,"), result.summary);
  });
});
