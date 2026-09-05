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

  /*
   * The demo's whole claim is that no provider is queried, so nothing it
   * produces may describe a request that never happened. "ready" is the
   * status meaning "we asked, and there is nothing" — beside an aqi and a
   * climate already honestly marked unavailable, alerts alone claimed a
   * successful fetch, and stamped a time for it (audit O-04). The route that
   * exists to prove the trust contract was the one place quietly breaking
   * it.
   */
  test("never claims a successful alerts fetch it did not make", () => {
    const model = buildMissingWeatherModel();

    assert.equal(model.alertsStatus, "unavailable");
    assert.deepEqual(model.alerts, []);
  });

  test("stamps no fetch time for the alerts request it never sent", () => {
    const state = buildMissingDashboardState();
    const trustMeta = state.trustMeta ?? state;

    assert.equal(trustMeta.alertsStatus, "unavailable");
    assert.equal(
      trustMeta.alertsFetchedAt,
      null,
      "a fetch that never happened has no time at which it returned"
    );
    // The forecast is genuinely synthesised and shown, so its own stamp
    // stays — this must not become "null everything".
    assert.ok(
      trustMeta.weatherFetchedAt,
      "the demo does render a forecast, so its stamp is real"
    );
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
    assert.match(state.locationNotice, /Portfolio demo/);
    assert.equal(state.showGlobalLoading, false);
    assert.equal(state.trustMeta.weatherFetchedAt, 1_700_000_000_000);
    assert.equal(state.trustMeta.climateStatus, "unavailable");
  });
});
