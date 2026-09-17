import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  readRainOutlook,
  readUvOutlook,
  resolveCurrentHourIndex,
} from "./forecastNow.js";

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
// Rain: every hour before now was wet, every hour from now on is dry, so a
// figure that counts the past is detectable.
const PAST_CHANCE = 80;
const PAST_AMOUNT = 0.1;
const REMAINING_CHANCE = 5;

function buildHourly({ from = -48, to = 24 } = {}) {
  const slotStart = new Date(NOW);
  slotStart.setMinutes(0, 0, 0);
  const time = [];
  const uvIndex = [];
  const rainChance = [];
  const rainAmount = [];
  for (let offset = from; offset <= to; offset += 1) {
    const slot = new Date(slotStart.getTime() + offset * HOUR_MS);
    time.push(naiveLocal(slot));
    const hour = slot.getHours();
    uvIndex.push(
      offset === 0 ? UV_NOW : hour === PEAK_HOUR ? UV_PEAK_HOURLY : 1
    );
    rainChance.push(offset < 0 ? PAST_CHANCE : REMAINING_CHANCE);
    rainAmount.push(offset < 0 ? PAST_AMOUNT : 0);
  }
  return { time, uvIndex, rainChance, rainAmount };
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
      rainChanceMax: [90, 80, 10],
      rainAmountTotal: [1, 0.5, 0],
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

describe("readRainOutlook", () => {
  // Slots from the current hour to 23:00 inclusive: the hour in progress
  // still counts.
  const HOURS_LEFT_TODAY = 24 - CURRENT_HOUR;

  test("peak and total cover the hours still ahead, not the calendar day", () => {
    // Every past hour was 80% and wet; every remaining hour is 5% and dry.
    // The daily figures for today say 80% and 0.5 in — the calendar day.
    assert.deepEqual(readRainOutlook(buildWeather(), NOW), {
      source: "hourly",
      chance: REMAINING_CHANCE,
      amount: 0,
      hoursRemaining: HOURS_LEFT_TODAY,
    });
  });

  test("the hour in progress counts, the one before it does not", () => {
    const hourly = buildHourly();
    hourly.rainChance[47] = 100; // the previous hour
    hourly.rainChance[48] = 40; // this hour
    const outlook = readRainOutlook(buildWeather({ hourly }), NOW);
    assert.equal(outlook.chance, 40);
  });

  test("tomorrow's hours do not count, even though the series carries them", () => {
    const hourly = buildHourly();
    const tomorrow = isoLocalDate(TOMORROW);
    hourly.time.forEach((time, index) => {
      if (time.slice(0, 10) === tomorrow) {
        hourly.rainChance[index] = 99;
        hourly.rainAmount[index] = 2;
      }
    });
    const outlook = readRainOutlook(buildWeather({ hourly }), NOW);
    assert.equal(outlook.chance, REMAINING_CHANCE);
    assert.equal(outlook.amount, 0);
  });

  test("the total is the sum of the remaining amounts", () => {
    const hourly = buildHourly();
    hourly.rainAmount[48] = 0.05;
    hourly.rainAmount[49] = 0.15;
    const outlook = readRainOutlook(buildWeather({ hourly }), NOW);
    assert.ok(Math.abs(outlook.amount - 0.2) < 1e-9, `amount ${outlook.amount}`);
  });

  test("a gap in the remaining amounts makes the total unknown, not an undercount", () => {
    const hourly = buildHourly();
    hourly.rainAmount[49] = null;
    const outlook = readRainOutlook(buildWeather({ hourly }), NOW);
    assert.equal(outlook.amount, null);
    // A maximum survives the same gap.
    assert.equal(outlook.chance, REMAINING_CHANCE);
  });

  test("a gap in the remaining chances leaves the peak to the hours that reported", () => {
    const hourly = buildHourly();
    hourly.rainChance[48] = null;
    hourly.rainChance[49] = 65;
    const outlook = readRainOutlook(buildWeather({ hourly }), NOW);
    assert.equal(outlook.chance, 65);
  });

  test("falls back to today's daily figures without an hourly series", () => {
    // Today is index 1 of the restored snapshot, not the stale index 0.
    assert.deepEqual(readRainOutlook(buildWeather({ hourly: undefined }), NOW), {
      source: "daily",
      chance: 80,
      amount: 0.5,
      hoursRemaining: null,
    });
  });

  test("a snapshot that ended yesterday falls back to the daily figures", () => {
    const stale = buildWeather({ hourly: buildHourly({ from: -48, to: -20 }) });
    const outlook = readRainOutlook(stale, NOW);
    assert.equal(outlook.source, "daily");
    assert.equal(outlook.chance, 80);
  });

  test("an hourly series with no rain fields falls back to the daily figures", () => {
    const { time, uvIndex } = buildHourly();
    const outlook = readRainOutlook(buildWeather({ hourly: { time, uvIndex } }), NOW);
    assert.equal(outlook.source, "daily");
    assert.equal(outlook.chance, 80);
    assert.equal(outlook.amount, 0.5);
  });

  test("reports nothing when neither series has a figure", () => {
    const outlook = readRainOutlook(buildWeather({ hourly: undefined, daily: undefined }), NOW);
    assert.deepEqual(outlook, { source: null, chance: null, amount: null, hoursRemaining: null });
  });

  test("an unusable clock cannot place the current hour, so the daily figures stand in", () => {
    const outlook = readRainOutlook(buildWeather(), null);
    assert.equal(outlook.source, "daily");
    // resolveTodayIndex's own fallback to index 0, as everywhere else.
    assert.equal(outlook.chance, 90);
  });
});
