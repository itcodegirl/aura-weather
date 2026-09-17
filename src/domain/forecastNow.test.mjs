import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { readUvOutlook, resolveCurrentHourIndex } from "./forecastNow.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// A fixed instant. The payload below carries no timezone, so its naive
// hourly strings parse in the runtime's zone and "now" is compared in that
// same frame — the fixture is therefore built from the instant's local
// wall clock, whatever zone the runner is in.
const NOW = Date.UTC(2026, 8, 1, 15, 30, 0);

function pad(value) {
  return String(value).padStart(2, "0");
}

function naiveLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

function isoLocalDate(date) {
  return naiveLocal(date).slice(0, 10);
}

const LOCAL_NOW = new Date(NOW);
const CURRENT_HOUR = LOCAL_NOW.getHours();
// Today's peak hour, chosen so it is never the current hour: the two
// readings have to be able to differ for the tests to mean anything.
const PEAK_HOUR = CURRENT_HOUR === 13 ? 14 : 13;
const UV_NOW = 3.4;
const UV_PEAK_HOURLY = 8.1;
const UV_PEAK_DAILY = 8.4;

// The live request shape: past_hours=48, so index 0 is two days ago, and
// the current hour sits at index 48. Yesterday carries the same hourly
// curve as today, so a peak found in the wrong day is detectable.
function buildHourly({ from = -48, to = 24 } = {}) {
  const slotStart = new Date(NOW);
  slotStart.setMinutes(0, 0, 0);
  const time = [];
  const uvIndex = [];
  for (let offset = from; offset <= to; offset += 1) {
    const slot = new Date(slotStart.getTime() + offset * HOUR_MS);
    time.push(naiveLocal(slot));
    const hour = slot.getHours();
    uvIndex.push(
      offset === 0 ? UV_NOW : hour === PEAK_HOUR ? UV_PEAK_HOURLY : 1
    );
  }
  return { time, uvIndex };
}

const YESTERDAY = new Date(NOW - 24 * HOUR_MS);
const TOMORROW = new Date(NOW + 24 * HOUR_MS);

// A snapshot restored from yesterday: index 0 is yesterday, today is index 1.
function buildWeather(overrides = {}) {
  return {
    meta: {},
    hourly: buildHourly(),
    daily: {
      time: [isoLocalDate(YESTERDAY), isoLocalDate(LOCAL_NOW), isoLocalDate(TOMORROW)],
      uvIndexMax: [1, UV_PEAK_DAILY, 9],
    },
    ...overrides,
  };
}

function todayAt(hour) {
  const date = new Date(NOW);
  date.setHours(hour, 0, 0, 0);
  return naiveLocal(date);
}

describe("resolveCurrentHourIndex", () => {
  test("finds the slot that started within the last hour, not index 0", () => {
    assert.equal(resolveCurrentHourIndex(buildWeather(), NOW), 48);
  });

  test("holds the slot until the next one starts", () => {
    assert.equal(resolveCurrentHourIndex(buildWeather(), NOW + 29 * MINUTE_MS), 48);
    assert.equal(resolveCurrentHourIndex(buildWeather(), NOW - 31 * MINUTE_MS), 47);
  });

  test("reframes now into the location's zone before comparing", () => {
    // 15:30Z is 00:30 on the 2nd in Tokyo, and the provider's naive strings
    // are Tokyo wall-clock — so the current slot is the one labelled
    // midnight on the 2nd, whatever zone this test runs in.
    const weather = {
      meta: { timezone: "Asia/Tokyo" },
      hourly: {
        time: ["2026-09-01T23:00", "2026-09-02T00:00", "2026-09-02T01:00"],
      },
    };
    assert.equal(resolveCurrentHourIndex(weather, NOW), 1);
  });

  test("is unknown, not zero, without a clock or a series", () => {
    assert.equal(resolveCurrentHourIndex(buildWeather(), null), -1);
    assert.equal(resolveCurrentHourIndex(buildWeather(), Number.NaN), -1);
    assert.equal(resolveCurrentHourIndex(buildWeather({ hourly: undefined }), NOW), -1);
    assert.equal(resolveCurrentHourIndex(buildWeather({ hourly: { time: [] } }), NOW), -1);
    assert.equal(resolveCurrentHourIndex(null, NOW), -1);
  });

  test("a series that ended yesterday has no current hour", () => {
    // findWindowStartIndex answers with the series' tail here; that hour is
    // yesterday evening, and a stale snapshot must not present it as now.
    const stale = buildWeather({ hourly: buildHourly({ from: -48, to: -20 }) });
    assert.equal(resolveCurrentHourIndex(stale, NOW), -1);
    // Nor is a series that starts tomorrow.
    const future = buildWeather({ hourly: buildHourly({ from: 6, to: 24 }) });
    assert.equal(resolveCurrentHourIndex(future, NOW), -1);
  });
});

describe("readUvOutlook", () => {
  test("now is this hour's reading and the peak is today's daily maximum", () => {
    const outlook = readUvOutlook(buildWeather(), NOW);
    assert.equal(outlook.now, UV_NOW);
    // Today is index 1 of the restored snapshot, not the stale index 0 (1).
    assert.equal(outlook.peak, UV_PEAK_DAILY);
    assert.equal(outlook.peakTime, todayAt(PEAK_HOUR));
    assert.equal(outlook.peakIsPast, PEAK_HOUR < CURRENT_HOUR);
  });

  test("the peak hour is searched within today, not yesterday's identical curve", () => {
    const outlook = readUvOutlook(buildWeather(), NOW);
    assert.equal(outlook.peakTime.slice(0, 10), isoLocalDate(LOCAL_NOW));
  });

  test("a missing hourly series leaves now and the peak hour unknown, never the peak standing in", () => {
    const outlook = readUvOutlook(buildWeather({ hourly: undefined }), NOW);
    assert.equal(outlook.now, null);
    assert.equal(outlook.peak, UV_PEAK_DAILY);
    assert.equal(outlook.peakTime, null);
    assert.equal(outlook.peakIsPast, null);
  });

  test("a null reading at the current hour is missing, not zero and not the peak", () => {
    const hourly = buildHourly();
    hourly.uvIndex[48] = null;
    const outlook = readUvOutlook(buildWeather({ hourly }), NOW);
    assert.equal(outlook.now, null);
    assert.equal(outlook.peak, UV_PEAK_DAILY);
  });

  test("a snapshot that ended yesterday reports no current reading and no peak hour", () => {
    const stale = buildWeather({ hourly: buildHourly({ from: -48, to: -20 }) });
    const outlook = readUvOutlook(stale, NOW);
    assert.equal(outlook.now, null);
    assert.equal(outlook.peak, UV_PEAK_DAILY);
    assert.equal(outlook.peakTime, null);
  });

  test("a missing daily maximum leaves the peak unknown", () => {
    const outlook = readUvOutlook(buildWeather({ daily: undefined }), NOW);
    assert.equal(outlook.now, UV_NOW);
    assert.equal(outlook.peak, null);
  });

  test("falls back to the calendar date when the daily series carries no dates", () => {
    const outlook = readUvOutlook(
      buildWeather({ daily: { uvIndexMax: [UV_PEAK_DAILY] } }),
      NOW
    );
    assert.equal(outlook.peak, UV_PEAK_DAILY);
    assert.equal(outlook.peakTime, todayAt(PEAK_HOUR));
  });

  test("an unusable clock makes every reading unknown rather than guessed", () => {
    const outlook = readUvOutlook(buildWeather(), null);
    assert.equal(outlook.now, null);
    assert.equal(outlook.peakTime, null);
    assert.equal(outlook.peakIsPast, null);
    // The daily peak still resolves through resolveTodayIndex's own
    // fallback to index 0, exactly as the hero's panel does.
    assert.equal(outlook.peak, 1);
  });
});
