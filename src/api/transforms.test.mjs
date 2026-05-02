import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeWeatherResponse } from "./transforms.js";

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
        surface_pressure: 1014.5,
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
        surface_pressure: null,
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
        surface_pressure: "1014.5",
      },
    });

    assert.equal(model.current.temperature, null);
    assert.equal(model.current.humidity, null);
    assert.equal(model.current.pressure, 1014.5);
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
});
