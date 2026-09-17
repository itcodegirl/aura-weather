import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeVisibility, normalizeWeatherResponse } from "./transforms.js";

describe("normalizeWeatherResponse", () => {
  test("preserves valid current readings", () => {
    const model = normalizeWeatherResponse({
      latitude: 41.8781,
      longitude: -87.6298,
      timezone: "America/Chicago",
      current: {
        temperature_2m: 67.2,
        relative_humidity_2m: 62,
        apparent_temperature: 65.8,
        weather_code: 2,
        wind_speed_10m: 8.4,
        wind_gusts_10m: 11.2,
        wind_direction_10m: 220,
        pressure_msl: 1014.5,
        dew_point_2m: 53.1,
        cloud_cover: 35,
        visibility: 16093,
      },
    });

    assert.equal(model.meta.timezone, "America/Chicago");
    assert.equal(model.current.temperature, 67.2);
    assert.equal(model.current.humidity, 62);
    assert.equal(model.current.pressure, 1014.5);
    assert.equal(model.current.dewPoint, 53.1);
  });

  test("keeps the valid time, its interval and the location's UTC offset", () => {
    // Audit finding A-09. "Current" conditions are model output valid at
    // `current.time` on a 15-minute grid; the model dropped the time, so
    // the only clock the hero could show was the fetch.
    const model = normalizeWeatherResponse({
      utc_offset_seconds: -18000,
      timezone: "America/Chicago",
      current: { time: " 2026-09-16T19:30 ", interval: 900, temperature_2m: 68.2 },
    });

    assert.equal(model.meta.utcOffsetSeconds, -18000);
    assert.equal(model.current.time, "2026-09-16T19:30");
    assert.equal(model.current.interval, 900);
  });

  test("a missing valid time or offset stays missing", () => {
    const model = normalizeWeatherResponse({
      current: { time: "", interval: null, temperature_2m: 68.2 },
    });
    assert.equal(model.meta.utcOffsetSeconds, null);
    assert.equal(model.current.time, null);
    assert.equal(model.current.interval, null);

    const junk = normalizeWeatherResponse({
      utc_offset_seconds: "later",
      current: { time: 1758050000000, interval: "900s" },
    });
    assert.equal(junk.meta.utcOffsetSeconds, null);
    assert.equal(junk.current.time, null, "a number is not a provider timestamp");
    assert.equal(junk.current.interval, null);
  });

  test("preserves null when the API reports a missing current field", () => {
    // Trust contract: a partial response cannot surface as fake 0% / 0 hPa.
    // The normalized model must keep the nullness so downstream
    // components fall back to "—" instead of rendering 0.
    const model = normalizeWeatherResponse({
      current: {
        temperature_2m: null,
        relative_humidity_2m: null,
        apparent_temperature: null,
        weather_code: 2,
        wind_speed_10m: null,
        wind_gusts_10m: null,
        wind_direction_10m: null,
        pressure_msl: null,
        dew_point_2m: null,
        cloud_cover: null,
        visibility: null,
      },
    });

    assert.equal(model.current.temperature, null);
    assert.equal(model.current.humidity, null);
    assert.equal(model.current.feelsLike, null);
    assert.equal(model.current.pressure, null);
    assert.equal(model.current.dewPoint, null);
    assert.equal(model.current.windSpeed, null);
    // weather_code can still be a real value alongside missing samples.
    assert.equal(model.current.conditionCode, 2);
  });

  test("preserves null when the API returns empty strings", () => {
    const model = normalizeWeatherResponse({
      current: {
        temperature_2m: "",
        relative_humidity_2m: " ",
        pressure_msl: "1014.5",
      },
    });

    assert.equal(model.current.temperature, null);
    assert.equal(model.current.humidity, null);
    assert.equal(model.current.pressure, 1014.5);
  });

  test("reads sea-level pressure and never falls back to station pressure", () => {
    // Live values from the default city (183 m): station 1002.4 hPa beside a
    // sea-level 1023.9 hPa. The request used to fetch the station figure, so
    // the gauge disagreed with every barometer by ~21 hPa / 0.6 inHg.
    const model = normalizeWeatherResponse({
      current: { pressure_msl: 1023.9, surface_pressure: 1002.4 },
      hourly: {
        time: ["2026-09-16T16:00"],
        pressure_msl: [1023.7],
        surface_pressure: [1002.2],
      },
    });

    assert.equal(model.current.pressure, 1023.9);
    assert.deepEqual(model.hourly.pressure, [1023.7]);

    // A payload that carries only station pressure is a payload without a
    // sea-level reading. Presenting the station figure on a sea-level gauge
    // is the bug this replaced, so the reading is missing, not substituted.
    const stationOnly = normalizeWeatherResponse({
      current: { surface_pressure: 1002.4 },
    });
    assert.equal(stationOnly.current.pressure, null);
  });

  test("returns an empty model when raw is missing or wrong shape", () => {
    const empty = normalizeWeatherResponse(null);
    assert.equal(empty.meta.timezone, "UTC");
    assert.equal(empty.current.temperature, null);
    assert.deepEqual(empty.hourly.time, []);
    assert.deepEqual(empty.daily.time, []);

    const wrongShape = normalizeWeatherResponse("not-an-object");
    assert.equal(wrongShape.current.temperature, null);
  });

  test("keeps hourly/daily/minutely arrays even when items are null", () => {
    // The arrays themselves are passed through; downstream consumers
    // (HourlyCard, ForecastCard, NowcastCard, useRainAnalysis) parse
    // each slot with the strict toFiniteNumber so a single null
    // entry skips that point instead of rendering a fake 0°F.
    const model = normalizeWeatherResponse({
      hourly: {
        time: ["2026-05-02T12:00:00", "2026-05-02T13:00:00"],
        temperature_2m: [null, 70],
        weather_code: [3, null],
        precipitation_probability: [null, null],
      },
    });

    assert.deepEqual(model.hourly.time.length, 2);
    assert.equal(model.hourly.temperature[0], null);
    assert.equal(model.hourly.temperature[1], 70);
  });

  test("preserves daily detail arrays used by the expandable forecast view", () => {
    const model = normalizeWeatherResponse({
      daily: {
        time: ["2026-05-02"],
        temperature_2m_max: [72],
        temperature_2m_min: [54],
        sunrise: ["2026-05-02T05:52:00-05:00"],
        sunset: ["2026-05-02T19:48:00-05:00"],
        uv_index_max: [7.4],
        precipitation_probability_max: [58],
        wind_speed_10m_max: [18],
        wind_gusts_10m_max: [27],
        wind_direction_10m_dominant: [235],
      },
    });

    assert.deepEqual(model.daily.windSpeedMax, [18]);
    assert.deepEqual(model.daily.windGustMax, [27]);
    assert.deepEqual(model.daily.windDirectionDominant, [235]);
    assert.deepEqual(model.daily.sunrise, ["2026-05-02T05:52:00-05:00"]);
  });

  test("normalizes timezone fallback when missing or whitespace", () => {
    assert.equal(normalizeWeatherResponse({}).meta.timezone, "UTC");
    assert.equal(
      normalizeWeatherResponse({ timezone: "" }).meta.timezone,
      "UTC"
    );
    assert.equal(
      normalizeWeatherResponse({ timezone: "  " }).meta.timezone,
      "UTC"
    );
    assert.equal(
      normalizeWeatherResponse({ timezone: "Europe/London" }).meta.timezone,
      "Europe/London"
    );
  });

  test("converts visibility declared in feet into metres", () => {
    // Live shape: with precipitation_unit=inch Open-Meteo answers
    // `current_units.visibility: "ft"`. The tile reads metres, so 48,884.5 ft
    // (9.3 mi) used to render as "30 mi · clear".
    const model = normalizeWeatherResponse({
      current_units: { visibility: "ft" },
      current: { visibility: 48884.516 },
      hourly_units: { visibility: "ft" },
      hourly: {
        time: ["2026-09-16T16:00", "2026-09-16T17:00"],
        visibility: [45603.676, null],
      },
    });

    assert.ok(Math.abs(model.current.visibility - 14900) < 0.01);
    assert.ok(Math.abs(model.hourly.visibility[0] - 13900) < 0.01);
    assert.equal(model.hourly.visibility[1], null);
  });

  test("keeps visibility declared in metres as-is", () => {
    const model = normalizeWeatherResponse({
      current_units: { visibility: "m" },
      current: { visibility: 14900 },
    });

    assert.equal(model.current.visibility, 14900);
  });

  test("treats an undeclared visibility unit as the documented default, metres", () => {
    // Fixtures and mocks omit `current_units`; the provider documents metres.
    const model = normalizeWeatherResponse({ current: { visibility: 16093 } });

    assert.equal(model.current.visibility, 16093);
  });

  test("reports a visibility unit it cannot read as missing, never as a number", () => {
    const model = normalizeWeatherResponse({
      current_units: { visibility: "furlongs" },
      current: { visibility: 12 },
    });

    assert.equal(model.current.visibility, null);
  });

  test("keeps a null visibility null whatever unit is declared", () => {
    const model = normalizeWeatherResponse({
      current_units: { visibility: "ft" },
      current: { visibility: null },
    });

    assert.equal(model.current.visibility, null);
    assert.equal(normalizeVisibility(1, " FT "), 0.3048);
  });
});
