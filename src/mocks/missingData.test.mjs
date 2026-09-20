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
    /*
     * This assertion used to be its inverse, guarding a deliberate earlier
     * decision: "The forecast is genuinely synthesised and shown, so its
     * own stamp stays -- this must not become 'null everything'."
     *
     * That reading is reversed here, and the reason is evidence the earlier
     * decision did not have. weatherFetchedAt is not read as "when was this
     * model built"; GlobalUpdateIndicator reads a present, non-cached stamp
     * as LIVE (GlobalUpdateIndicator.jsx:91-97). So reloading ?mock=missing
     * with the browser offline rendered "Updated just now / LIVE" over data
     * no provider had ever supplied -- measured at 3s, 8s, 15s and 25s
     * after the reload, with no offline/cached/stale wording anywhere in
     * the DOM. That is a fabricated freshness claim on the one route whose
     * entire purpose is demonstrating that this app does not fabricate.
     *
     * The earlier concern still holds and is still guarded: this is NOT
     * "null everything". The demo's synthesised forecast is still built and
     * still rendered, and the tests above still assert its shape. Only the
     * provider-freshness stamp goes, because no provider was read.
     */
    assert.equal(
      trustMeta.weatherFetchedAt,
      null,
      "no provider was queried on this route, so nothing may date it as live"
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
    const state = buildMissingDashboardState();
    assert.equal(state.weather.aqi, null);
    assert.equal(state.location.name, "Sample City");
    assert.match(state.locationNotice, /Portfolio demo/);
    assert.equal(state.showGlobalLoading, false);
    assert.equal(state.trustMeta.climateStatus, "unavailable");
  });

  /*
   * The demo route queries no provider -- its own notice says so. It used
   * to stamp trustMeta.weatherFetchedAt with Date.now() anyway, which is
   * the fabricated-freshness case this app exists to avoid: a present
   * fetched-at is what GlobalUpdateIndicator reads as "live", so
   * reloading ?mock=missing with the browser offline rendered
   * "Updated just now / LIVE" over data that had never been fetched --
   * measured at 3s, 8s, 15s and 25s after the reload, with no offline,
   * cached or stale wording anywhere in the DOM.
   *
   * The route is the one e2e/pwa-offline.spec.js reloads offline and the
   * one README publishes as the demo, so it is the surface most likely to
   * be seen making the claim.
   */
  test("the demo dates no read, because it makes none", () => {
    const { trustMeta } = buildMissingDashboardState();
    for (const key of [
      "weatherFetchedAt",
      "aqiFetchedAt",
      "climateFetchedAt",
      "alertsFetchedAt",
      "cacheCapturedAt",
      "cacheRestoredAt",
    ]) {
      assert.equal(
        trustMeta[key],
        null,
        `${key} should be null: no request was made on this route, so there ` +
          "is no time at which one returned"
      );
    }
  });
});
