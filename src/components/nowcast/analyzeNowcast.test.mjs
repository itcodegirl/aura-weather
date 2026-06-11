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
});
