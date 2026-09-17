import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeWeatherResponse } from "./transforms.js";

/*
 * A response recorded from the live forecast endpoint on 2026-09-16 (19:30
 * local) with the exact query fetchWeather builds (the current/hourly/daily/
 * minutely_15 variable lists, temperature_unit=fahrenheit,
 * wind_speed_unit=mph, precipitation_unit=inch, timezone=auto,
 * forecast_days=7, past_hours=48), trimmed to the first three entries of
 * every series. Re-record it whenever the query changes, so the fixture
 * keeps answering the request the app actually makes.
 *
 * Every hand-written fixture in this repo omitted the `*_units` blocks, so
 * the one fact that made visibility wrong — the provider declares FEET
 * alongside inch precipitation — was invisible to a thousand passing tests.
 * This pins the units the app's conversions assume. When Open-Meteo changes
 * a unit, re-record the fixture with the same query and this fails loudly
 * instead of a tile quietly printing the right number in the wrong unit.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/open-meteo-forecast.recorded.json", import.meta.url),
    "utf8"
  )
);

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source?.[key]]));
}

describe("recorded Open-Meteo forecast response", () => {
  test("declares the units the app's conversions assume", () => {
    assert.deepEqual(
      pick(fixture.current_units, [
        "temperature_2m",
        "wind_speed_10m",
        "wind_gusts_10m",
        "pressure_msl",
        "visibility",
      ]),
      {
        temperature_2m: "°F",
        wind_speed_10m: "mp/h",
        wind_gusts_10m: "mp/h",
        pressure_msl: "hPa",
        visibility: "ft",
      }
    );
    assert.equal(fixture.hourly_units.pressure_msl, "hPa");
    assert.equal(fixture.hourly_units.precipitation, "inch");
    assert.equal(fixture.hourly_units.visibility, "ft");
    assert.equal(fixture.daily_units.precipitation_sum, "inch");
    assert.equal(fixture.minutely_15_units.precipitation, "inch");
  });

  test("was recorded with the pressure field the app reads", () => {
    // The request asks for sea-level pressure and nothing else; a recording
    // that still carried station pressure would be answering a query the app
    // no longer makes.
    assert.ok("pressure_msl" in fixture.current);
    assert.ok(!("surface_pressure" in fixture.current));
    assert.ok(!("surface_pressure" in fixture.hourly));
  });

  test("normalizes the recorded visibility into metres", () => {
    const model = normalizeWeatherResponse(fixture);

    // 44,947.508 ft × 0.3048 = 13,700 m; the provider reports metres directly
    // when the request asks for precipitation_unit=mm instead.
    assert.ok(Math.abs(model.current.visibility - 13700) < 0.01);
    assert.equal(model.hourly.visibility.length, 3);
    assert.ok(
      model.hourly.visibility.every(
        (value) => value === null || value < 100_000
      ),
      "hourly visibility is metres, not the provider's feet"
    );
  });

  test("keeps the recorded valid time, interval and offset", () => {
    const model = normalizeWeatherResponse(fixture);
    assert.equal(model.current.time, fixture.current.time);
    assert.equal(model.current.time, "2026-09-16T19:30");
    assert.equal(model.current.interval, 900);
    assert.equal(model.meta.utcOffsetSeconds, -18000);
  });

  test("passes every other current reading through unchanged", () => {
    const model = normalizeWeatherResponse(fixture);

    assert.equal(model.meta.timezone, "America/Chicago");
    assert.equal(model.current.temperature, 68.2);
    assert.equal(model.current.humidity, 91);
    assert.equal(model.current.windSpeed, 3.6);
    assert.equal(model.current.windGust, 9.4);
    // Sea-level pressure; the same instant's station pressure was 1002.3 hPa.
    assert.equal(model.current.pressure, 1023.9);
    assert.deepEqual(model.hourly.pressure, [1017.5, 1017.3, 1017.1]);
    assert.equal(model.current.dewPoint, 65.5);
  });
});
