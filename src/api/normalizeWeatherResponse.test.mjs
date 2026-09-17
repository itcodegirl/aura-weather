import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeWeatherResponse } from "./transforms.js";

describe("normalizeWeatherResponse model mapping", () => {
  test("maps Open-Meteo response into app-domain weather model", () => {
    const normalized = normalizeWeatherResponse({
      latitude: 41.88,
      longitude: -87.63,
      timezone: "America/Chicago",
      utc_offset_seconds: -18000,
      current: {
        time: "2026-04-20T12:00",
        interval: 900,
        temperature_2m: 72.4,
        relative_humidity_2m: 60,
        apparent_temperature: 74.1,
        weather_code: 2,
        wind_speed_10m: 12.3,
        wind_gusts_10m: 17.8,
        wind_direction_10m: 220,
        pressure_msl: 1014.2,
        dew_point_2m: 58.7,
      },
      hourly: {
        time: ["2026-04-20T12:00", "2026-04-20T13:00"],
        temperature_2m: [72.4, 73.1],
        weather_code: [2, 3],
        precipitation_probability: [10, 20],
        precipitation: [0, 0.02],
        pressure_msl: [1014.2, 1013.8],
        cape: [120, 140],
        wind_gusts_10m: [17.8, 18.4],
      },
      daily: {
        time: ["2026-04-20"],
        weather_code: [2],
        temperature_2m_max: [79.2],
        temperature_2m_min: [61.5],
        sunrise: ["2026-04-20T06:07"],
        sunset: ["2026-04-20T19:42"],
        uv_index_max: [6.1],
        precipitation_probability_max: [25],
        precipitation_sum: [0.12],
      },
      minutely_15: {
        time: ["2026-04-20T12:00", "2026-04-20T12:15"],
        weather_code: [2, 61],
        precipitation_probability: [10, 45],
        precipitation: [0, 0.01],
      },
      // The declared units, spelled the way the live API spells them
      // ("mp/h", not "mph"). transforms.js checks the model's assumptions
      // against these and refuses a payload that disagrees.
      current_units: {
        temperature_2m: "°F",
        apparent_temperature: "°F",
        dew_point_2m: "°F",
        wind_speed_10m: "mp/h",
        wind_gusts_10m: "mp/h",
        pressure_msl: "hPa",
        relative_humidity_2m: "%",
        visibility: "ft",
      },
      hourly_units: {
        temperature_2m: "°F",
        precipitation: "inch",
        precipitation_probability: "%",
        pressure_msl: "hPa",
        cape: "J/kg",
        wind_gusts_10m: "mp/h",
        visibility: "ft",
      },
      minutely_15_units: {
        precipitation: "inch",
        precipitation_probability: "%",
      },
    });

    assert.deepEqual(normalized.meta, {
      latitude: 41.88,
      longitude: -87.63,
      timezone: "America/Chicago",
      utcOffsetSeconds: -18000,
      // Carried, not assumed: only the fields the payload actually declared.
      units: {
        current: {
          temperature_2m: "°F",
          apparent_temperature: "°F",
          dew_point_2m: "°F",
          wind_speed_10m: "mp/h",
          wind_gusts_10m: "mp/h",
          pressure_msl: "hPa",
          relative_humidity_2m: "%",
        },
        hourly: {
          temperature_2m: "°F",
          precipitation: "inch",
          precipitation_probability: "%",
          pressure_msl: "hPa",
          cape: "J/kg",
          wind_gusts_10m: "mp/h",
        },
        visibility: { current: "ft", hourly: "ft" },
      },
    });
    assert.equal(normalized.current.time, "2026-04-20T12:00");
    assert.equal(normalized.current.interval, 900);
    assert.equal(normalized.current.temperature, 72.4);
    assert.equal(normalized.current.conditionCode, 2);
    assert.deepEqual(normalized.hourly.temperature, [72.4, 73.1]);
    assert.deepEqual(normalized.hourly.rainChance, [10, 20]);
    assert.deepEqual(normalized.daily.temperatureMax, [79.2]);
    assert.deepEqual(normalized.daily.rainChanceMax, [25]);
    assert.deepEqual(normalized.nowcast.conditionCode, [2, 61]);
    assert.deepEqual(normalized.nowcast.rainAmount, [0, 0.01]);
  });

  test("returns safe fallbacks for missing sections", () => {
    const normalized = normalizeWeatherResponse(null);

    assert.equal(normalized.meta.timezone, "UTC");
    // A payload that declares nothing carries nothing — not a guess.
    assert.deepEqual(normalized.meta.units, {
      current: {},
      hourly: {},
      visibility: { current: null, hourly: null },
    });
    assert.equal(normalized.current.temperature, null);
    assert.deepEqual(normalized.hourly.time, []);
    assert.deepEqual(normalized.daily.time, []);
    assert.deepEqual(normalized.nowcast.time, []);
  });
});
