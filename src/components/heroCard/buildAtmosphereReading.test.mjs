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

  test("high UV during daylight beats gusts and temp extremes", () => {
    const weather = buildBaseWeather({
      current: { temperature: 95, windGust: 35 },
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

  test("moderate UV during daylight surfaces a softer notice", () => {
    const weather = buildBaseWeather({
      current: { temperature: 65, windGust: 5 },
      daily: {
        sunrise: [SUNRISE_ISO],
        sunset: [SUNSET_ISO],
        uvIndexMax: [6.4],
      },
    });
    const result = buildAtmosphereReading({ weather, nowMs: FIXED_NOW });
    assert.equal(result.tone, "notice");
    assert.match(result.text, /Moderate UV/);
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
