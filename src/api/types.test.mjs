import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { WEATHER_MODEL_SCHEMA_VERSION, createEmptyWeatherModel } from "./types.js";

describe("api weather model contract", () => {
  test("exposes a schema version", () => {
    assert.equal(WEATHER_MODEL_SCHEMA_VERSION, 1);
  });

  test("creates a fresh weather model skeleton", () => {
    const model = createEmptyWeatherModel();

    assert.equal(model.meta.timezone, "UTC");
    assert.equal(model.current.temperature, null);
    assert.deepEqual(model.hourly.time, []);
    assert.deepEqual(model.daily.time, []);
    assert.deepEqual(model.nowcast.time, []);

    const second = createEmptyWeatherModel();
    second.hourly.time.push("2026-04-20T00:00");
    assert.deepEqual(model.hourly.time, []);
  });
});
