import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { analyzeRain } from "./useRainAnalysis.js";

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

describe("analyzeRain", () => {
  test("keeps real zero precipitation readings as valid dry data", () => {
    const analysis = analyzeRain(buildHourly());

    assert.equal(analysis.hasData, true);
    assert.equal(analysis.peak.probability, 0);
    assert.equal(analysis.total, 0);
    assert.equal(analysis.missingSlots, 0);
  });

  test("treats all-null precipitation readings as unavailable, not fake zero rain", () => {
    const analysis = analyzeRain(
      buildHourly({
        rainChance: Array.from({ length: 24 }, () => null),
        rainAmount: Array.from({ length: 24 }, () => null),
      })
    );

    assert.equal(analysis.hasData, false);
    assert.equal(analysis.peak, null);
    assert.equal(analysis.total, null);
    assert.equal(analysis.missingSlots, 24);
    assert.equal(
      analysis.hours.every((hour) => hour.missing),
      true
    );
  });

  test("preserves missing slots inside an otherwise usable rain timeline", () => {
    const analysis = analyzeRain(
      buildHourly({
        rainChance: [10, null, 45, ...Array.from({ length: 21 }, () => 0)],
        rainAmount: [0, null, 0.05, ...Array.from({ length: 21 }, () => 0)],
      })
    );

    assert.equal(analysis.hasData, true);
    assert.equal(analysis.missingSlots, 1);
    assert.equal(analysis.hours[1].probability, null);
    assert.equal(analysis.hours[1].amount, null);
    assert.equal(analysis.nextRain.probability, 45);
    assert.equal(analysis.total, 0.05);
  });

  test("computes 'so far today' against the location's day boundary, not the device's", () => {
    // 2026-06-15T20:00Z is 2026-06-16T05:00 in Tokyo (UTC+9), so "today" in
    // Tokyo starts at the 2026-06-16T00:00 slot. A viewer in a western zone
    // must not fold the previous Tokyo day's rain into "so far today".
    const now = Date.UTC(2026, 5, 15, 20, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    // 48 naive Tokyo wall-clock slots from 2026-06-15T00:00 (no offset —
    // exactly how Open-Meteo returns timestamps with timezone=auto).
    const time = Array.from({ length: 48 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 15, i, 0, 0));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
        d.getUTCDate()
      )}T${pad(d.getUTCHours())}:00`;
    });
    const rainAmount = Array.from({ length: 48 }, () => 0);
    rainAmount[10] = 3; // 2026-06-15 10:00 — previous Tokyo day, must be excluded
    for (let i = 24; i < 29; i += 1) rainAmount[i] = 0.5; // 06-16 00:00–04:00 = 2.5 total

    const analysis = analyzeRain(
      { time, rainChance: Array.from({ length: 48 }, () => 0), rainAmount },
      "Asia/Tokyo",
      now
    );

    // Only the five early-morning 06-16 slots (2.5), not the 06-15 daytime rain.
    assert.equal(analysis.soFarToday, 2.5);
  });
});
