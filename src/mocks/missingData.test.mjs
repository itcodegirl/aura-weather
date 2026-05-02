import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildMissingDashboardState,
  buildMissingWeatherModel,
  isMissingMockEnabled,
} from "./missingData.js";

describe("missingData mock", () => {
  test("isMissingMockEnabled accepts the canonical query string", () => {
    assert.equal(isMissingMockEnabled("?mock=missing"), true);
    assert.equal(isMissingMockEnabled("mock=missing"), true);
    assert.equal(isMissingMockEnabled("?mock=missing&foo=bar"), true);
  });

  test("isMissingMockEnabled rejects unrelated input", () => {
    assert.equal(isMissingMockEnabled(""), false);
    assert.equal(isMissingMockEnabled("?other=value"), false);
    assert.equal(isMissingMockEnabled("?mock=other"), false);
    assert.equal(isMissingMockEnabled(null), false);
    assert.equal(isMissingMockEnabled(undefined), false);
  });

  test("buildMissingWeatherModel produces only null readings", () => {
    const model = buildMissingWeatherModel();
    const currentValues = Object.values(model.current);
    assert.ok(
      currentValues.every((value) => value === null),
      "every current reading should be null"
    );
    assert.ok(
      model.hourly.temperature.every((value) => value === null),
      "hourly temperature should be entirely null"
    );
    assert.ok(
      model.daily.temperatureMax.every((value) => value === null),
      "daily highs should be entirely null"
    );
    assert.equal(model.aqi, null);
    assert.deepEqual(model.alerts, []);
  });

  test("buildMissingDashboardState provides a usable demo wrapper", () => {
    const state = buildMissingDashboardState({ now: 1_700_000_000_000 });
    assert.equal(state.weather.aqi, null);
    assert.equal(state.location.name, "Sample City");
    assert.equal(state.showGlobalLoading, false);
    assert.equal(state.trustMeta.weatherFetchedAt, 1_700_000_000_000);
    assert.equal(state.trustMeta.climateStatus, "unavailable");
  });
});
