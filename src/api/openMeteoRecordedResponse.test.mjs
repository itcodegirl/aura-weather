import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeWeatherResponse } from "./transforms.js";

/*
 * A response recorded from the live forecast endpoint on 2026-09-16 with the
 * exact query fetchWeather builds (the current/hourly/daily/minutely_15
 * variable lists, temperature_unit=fahrenheit, wind_speed_unit=mph,
 * precipitation_unit=inch, timezone=auto, forecast_days=7, past_hours=48),
 * trimmed to the first three entries of every series.
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
        "surface_pressure",
        "visibility",
      ]),
      {
        temperature_2m: "°F",
        wind_speed_10m: "mp/h",
        wind_gusts_10m: "mp/h",
        surface_pressure: "hPa",
        visibility: "ft",
      }
    );
    assert.equal(fixture.hourly_units.precipitation, "inch");
    assert.equal(fixture.hourly_units.visibility, "ft");
    assert.equal(fixture.daily_units.precipitation_sum, "inch");
    assert.equal(fixture.minutely_15_units.precipitation, "inch");
  });

  test("normalizes the recorded visibility into metres", () => {
    const model = normalizeWeatherResponse(fixture);

    // 48,884.516 ft × 0.3048 = 14,900 m — the value the same instant reports
    // when the request asks for precipitation_unit=mm instead.
    assert.ok(Math.abs(model.current.visibility - 14900) < 0.01);
    assert.equal(model.hourly.visibility.length, 3);
    assert.ok(
      model.hourly.visibility.every(
        (value) => value === null || value < 100_000
      ),
      "hourly visibility is metres, not the provider's feet"
    );
  });

  test("passes every other current reading through unchanged", () => {
    const model = normalizeWeatherResponse(fixture);

    assert.equal(model.meta.timezone, "America/Chicago");
    assert.equal(model.current.temperature, 70.5);
    assert.equal(model.current.humidity, 87);
    assert.equal(model.current.windSpeed, 5.2);
    assert.equal(model.current.windGust, 9.4);
    assert.equal(model.current.pressure, 1002.4);
    assert.equal(model.current.dewPoint, 66.5);
  });
});
