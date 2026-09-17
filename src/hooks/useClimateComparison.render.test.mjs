import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, act } = await import("@testing-library/react");
const { useClimateComparison } = await import("./useClimateComparison.js");
const { getIsoDateInTimeZone } = await import("../utils/dates.js");
const { climatologyCacheInternals } = await import("../services/climatologyCache.js");

/*
 * Audit finding E-03. The archive was asked for 30 years of daily rows on
 * every city switch and every fresh forecast, for one sentence whose
 * other half is a 30-year normal that changes once a year. These drive
 * the real hook against a counting fetch: one request per place and day,
 * the cache after that, and the cache before the offline gate.
 */

const realFetch = globalThis.fetch;
const TIMEZONE = "America/Chicago";
const CHICAGO = { latitude: 41.8781, longitude: -87.6298 };
const BOSTON = { latitude: 42.36, longitude: -71.06 };

function todayIso() {
  return getIsoDateInTimeZone(TIMEZONE, new Date());
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Two past years of the same calendar day, in the zone the hook resolves
// today in, so the archive filter keeps both samples.
function archivePayload(high) {
  const [year, month, day] = todayIso().split("-");
  const base = Number(year);
  return {
    daily: {
      time: [`${base - 2}-${month}-${day}`, `${base - 1}-${month}-${day}`],
      temperature_2m_max: [high, high],
    },
  };
}

function weatherWithHigh(high) {
  return {
    meta: { timezone: TIMEZONE },
    current: { temperature: 70 },
    daily: { time: [todayIso()], temperatureMax: [high] },
  };
}

function installArchiveFetch({ high = 60, usable = true } = {}) {
  const counters = { archiveCalls: 0 };
  globalThis.fetch = (input) => {
    const url = new URL(String(input?.url ?? input));
    if (url.hostname === "archive-api.open-meteo.com") {
      counters.archiveCalls += 1;
      return Promise.resolve(
        jsonResponse(
          usable
            ? archivePayload(high)
            : { daily: { time: [], temperature_2m_max: [] } }
        )
      );
    }
    return Promise.resolve(jsonResponse({}));
  };
  return counters;
}

function goOffline() {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => false,
  });
}

function goOnline() {
  delete navigator.onLine;
}

function Probe({ onState }) {
  const api = useClimateComparison({ enabled: true });
  React.useEffect(() => {
    onState(api);
  });
  return null;
}

async function mountProbe() {
  let latest = null;
  await act(async () => {
    render(
      React.createElement(Probe, {
        onState: (api) => {
          latest = api;
        },
      })
    );
  });
  return () => latest;
}

async function request(latest, coordinates, weatherData) {
  await act(async () => {
    await latest().requestClimateComparison({ coordinates, weatherData });
  });
}

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  goOnline();
  window.localStorage.clear();
});

describe("useClimateComparison climatology cache", () => {
  test("asks the archive once for a place and day, then serves the cache", async () => {
    const counters = installArchiveFetch({ high: 60 });
    const latest = await mountProbe();

    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 1);
    assert.equal(latest().climateStatus, "ready");
    assert.equal(latest().climateComparison?.difference, 18);
    assert.ok(
      window.localStorage.getItem(climatologyCacheInternals.CACHE_KEY),
      "the normal is written for the next visit"
    );

    // A fresh forecast lands for the same place: the normal is the same.
    await request(latest, CHICAGO, weatherWithHigh(80));
    assert.equal(counters.archiveCalls, 1, "no second archive request");
    assert.equal(latest().climateStatus, "ready");
    assert.equal(latest().climateComparison?.difference, 20);
  });

  test("another place is another request", async () => {
    const counters = installArchiveFetch({ high: 60 });
    const latest = await mountProbe();

    await request(latest, CHICAGO, weatherWithHigh(78));
    await request(latest, BOSTON, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 2);

    // And coming back to the first place is not.
    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 2);
  });

  test("a cached normal serves the comparison offline; an empty cache still does not fetch", async () => {
    const counters = installArchiveFetch({ high: 60 });
    const latest = await mountProbe();

    goOffline();
    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 0, "offline with nothing cached: no request");
    assert.equal(latest().climateStatus, "unavailable");

    goOnline();
    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 1);
    assert.equal(latest().climateStatus, "ready");

    goOffline();
    await request(latest, CHICAGO, weatherWithHigh(70));
    assert.equal(counters.archiveCalls, 1);
    assert.equal(latest().climateStatus, "ready", "the cached normal needs no network");
    assert.equal(latest().climateComparison?.difference, 10);
  });

  test("an archive answer with no usable sample is not cached", async () => {
    const counters = installArchiveFetch({ usable: false });
    const latest = await mountProbe();

    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(latest().climateStatus, "unavailable");
    assert.equal(window.localStorage.getItem(climatologyCacheInternals.CACHE_KEY), null);

    await request(latest, CHICAGO, weatherWithHigh(78));
    assert.equal(counters.archiveCalls, 2, "nothing cached, so it asks again");
  });
});
