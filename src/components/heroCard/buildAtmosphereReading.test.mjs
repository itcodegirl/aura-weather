import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildAtmosphereReading } from "./buildAtmosphereReading.js";

const FIXED_NOW = Date.UTC(2026, 3, 21, 18, 0, 0); // 6pm UTC
const SUNRISE_ISO = "2026-04-21T11:00:00Z";
const SUNSET_ISO = "2026-04-21T23:00:00Z";

function buildBaseWeather(overrides = {}) {
  return {
    current: {
      temperature: 65,
      windGust: 8,
    },
    hourly: {
      time: [
        "2026-04-21T18:00:00Z",
        "2026-04-21T19:00:00Z",
        "2026-04-21T20:00:00Z",
        "2026-04-21T21:00:00Z",
      ],
      rainChance: [0, 5, 10, 15],
      // FIXED_NOW is the first slot, so index 0 is "this hour".
      uvIndex: [3, 3, 2, 1],
    },
    daily: {
      sunrise: [SUNRISE_ISO],
      sunset: [SUNSET_ISO],
      uvIndexMax: [3],
    },
    alerts: [],
    ...overrides,
  };
}

describe("buildAtmosphereReading", () => {
  test("returns null when there is no current weather", () => {
    assert.equal(buildAtmosphereReading({}), null);
    assert.equal(buildAtmosphereReading({ weather: { current: null } }), null);
  });

  test("severe weather alert wins over every other signal", () => {
    const weather = buildBaseWeather({
      alerts: [
        { priority: "extreme", event: "Tornado Warning" },
      ],
      hourly: {
        time: ["2026-04-21T18:00:00Z", "2026-04-21T19:00:00Z"],
        rainChance: [0, 90],
      },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [11],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result.tone, "alert");
    assert.match(result.text, /Tornado Warning/);
  });

  test("critical normalized alerts are treated as severe hero signals", () => {
    const weather = buildBaseWeather({
      alerts: [
        { priority: "critical", event: "Flash Flood Warning" },
      ],
    });

    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });

    assert.equal(result.tone, "alert");
    assert.match(result.text, /Flash Flood Warning/);
  });

  test("imminent rain surfaces a clock and probability", () => {
    const weather = buildBaseWeather({
      hourly: {
        time: [
          "2026-04-21T18:00:00Z",
          "2026-04-21T19:00:00Z",
          "2026-04-21T20:00:00Z",
        ],
        rainChance: [0, 70, 80],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result.tone, "notice");
    assert.match(result.text, /umbrella/);
    assert.match(result.text, /70%/);
  });

  const HOURLY_TIMES = [
    "2026-04-21T18:00:00Z",
    "2026-04-21T19:00:00Z",
    "2026-04-21T20:00:00Z",
    "2026-04-21T21:00:00Z",
  ];

  test("high UV during daylight beats gusts and temp extremes", () => {
    const weather = buildBaseWeather({
      current: { temperature: 95, windGust: 35 },
      hourly: { time: HOURLY_TIMES, rainChance: [0, 5, 10, 15], uvIndex: [9.4, 9, 8, 7] },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [9.4],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result.tone, "watch");
    assert.match(result.text, /Very high UV/);
    assert.match(result.text, /9\.4/);
  });

  test("UV is suppressed at night", () => {
    const weather = buildBaseWeather({
      hourly: {
        time: ["2026-04-22T04:00:00Z"],
        rainChance: [0],
        // A reading the provider would never send at night; the daylight
        // gate has to hold on its own.
        uvIndex: [9],
      },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [9],
      },
    });
    // Midnight UTC is well outside the daylight window above.
    const midnight = Date.UTC(2026, 3, 22, 4, 0, 0);
    const result = buildAtmosphereReading({ weather, nowMs: midnight });
    assert.notEqual(result?.tone, "watch");
  });

  test("gusty winds win over temp extremes when UV is low", () => {
    const weather = buildBaseWeather({
      current: { temperature: 95, windGust: 35 },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [2],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.match(result.text, /Gusts to 35 mph/);
  });

  test("the gust callout follows the display unit, like every other wind readout", () => {
    // The sentence hardcoded "mph" while `unit` was explicitly discarded
    // (`void unit;`), so a metric reader saw a gust in mph beside a wind
    // speed in km/h on the same card. GUSTY_MPH stays a threshold on the
    // raw mph reading; only the rendered figure is converted.
    const weather = buildBaseWeather({
      current: { temperature: 95, windGust: 35 },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [2],
      },
    });

    const metric = buildAtmosphereReading({
      weather,
      nowMs: FIXED_NOW,
      unit: "C",
    });
    assert.match(metric.text, /Gusts to 56 km\/h/);
    assert.doesNotMatch(metric.text, /mph/);

    const imperial = buildAtmosphereReading({
      weather,
      nowMs: FIXED_NOW,
      unit: "F",
    });
    assert.match(imperial.text, /Gusts to 35 mph/);
  });

  test("UV in the shared High band (6–8) reads as High, never Moderate", () => {
    // Regression guard for the five-way threshold drift: a 6.5 peak
    // once rendered "Moderate UV today" here while the chip said
    // "UV high" and the panel said "UV High" on the same card.
    const weather = buildBaseWeather({
      current: { temperature: 65, windGust: 5 },
      hourly: { time: HOURLY_TIMES, rainChance: [0, 5, 10, 15], uvIndex: [6.5, 6, 5, 4] },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [6.5],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result.tone, "notice");
    assert.match(result.text, /High UV/);
    assert.doesNotMatch(result.text, /Moderate/i);
  });

  /*
   * Audit finding A-07. This sentence is present tense and it carried the
   * day's peak: "Very high UV (8.0) — sunscreen if you're heading out" at
   * 9 am over an actual index of about 2.
   */
  test("the UV line reports this hour's reading, not the day's peak", () => {
    const readingFor = (uvIndex) =>
      buildAtmosphereReading({
        weather: buildBaseWeather({
          current: { temperature: 65, windGust: 5 },
          hourly: { time: HOURLY_TIMES, rainChance: [0, 5, 10, 15], uvIndex },
          daily: { sunrise: [SUNRISE_ISO], sunset: [SUNSET_ISO], uvIndexMax: [9.4] },
        }),
        nowMs: FIXED_NOW,
      });

    // Low right now, Very High later: no present-tense callout.
    assert.equal(readingFor([2, 4, 7, 9.4]), null);
    // High right now: the callout carries this hour's number.
    const now = readingFor([6.5, 8, 9.4, 9]);
    assert.equal(now.tone, "notice");
    assert.match(now.text, /High UV \(6\.5\)/);
    // No hourly reading: silence, not the peak standing in.
    assert.equal(readingFor(undefined), null);
  });

  test("hot temperature triggers heat copy", () => {
    const weather = buildBaseWeather({
      current: { temperature: 96, windGust: 5 },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [2],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.match(result.text, /Hot day/);
  });

  test("chilly temperature triggers light-jacket copy", () => {
    const weather = buildBaseWeather({
      current: { temperature: 42, windGust: 5 },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [2],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.match(result.text, /light jacket/i);
  });

  test("returns null on an unremarkable mild dry day", () => {
    const weather = buildBaseWeather();
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result, null);
  });

  test("golden hour copy surfaces near sunset on an otherwise calm day", () => {
    const weather = buildBaseWeather();
    // 22:50 UTC is 10 minutes before the 23:00 UTC sunset fixture.
    const nearSunset = Date.UTC(2026, 3, 21, 22, 50, 0);
    const result = buildAtmosphereReading({ weather, nowMs: nearSunset });
    assert.equal(result?.tone, "calm");
    assert.match(result.text, /Golden hour|sunset/i);
  });
});
