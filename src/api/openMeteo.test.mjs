import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERTS_STATUS,
  fetchHistoricalTemperatureAverage,
  fetchWeather,
  fetchSevereWeatherAlerts,
} from "./openMeteo.js";

const realFetch = globalThis.fetch;

function createJsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Open-Meteo alert coverage helpers", () => {
  test("requests canonical imperial units for the forecast payload by default", async () => {
    let requestUrl = null;

    globalThis.fetch = async (url) => {
      requestUrl = new URL(String(url));
      return createJsonResponse({
        latitude: 41.8781,
        longitude: -87.6298,
        timezone: "America/Chicago",
        current: {},
        hourly: {},
        daily: {},
        minutely_15: {},
      });
    };

    await fetchWeather(41.8781, -87.6298);

    assert.equal(requestUrl?.searchParams.get("temperature_unit"), "fahrenheit");
    assert.equal(requestUrl?.searchParams.get("wind_speed_unit"), "mph");
    assert.equal(requestUrl?.searchParams.get("precipitation_unit"), "inch");
  });

  test("returns sorted alerts with a ready status when NWS data is available", async () => {
    globalThis.fetch = async () =>
      createJsonResponse({
        features: [
          {
            properties: {
              id: "minor-alert",
              event: "Special Weather Statement",
              severity: "Minor",
              urgency: "Expected",
              expires: "2026-05-01T16:00:00Z",
            },
          },
          {
            properties: {
              id: "severe-alert",
              event: "Tornado Warning",
              severity: "Severe",
              urgency: "Immediate",
              expires: "2026-05-01T15:00:00Z",
            },
          },
        ],
      }, {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json",
        },
      });

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.status, ALERTS_STATUS.ready);
    assert.equal(result.alerts.length, 2);
    assert.equal(result.alerts[0].id, "severe-alert");
    assert.equal(result.alerts[0].priority, "high");
    assert.equal(result.alerts[1].id, "minor-alert");
  });

  test("marks 400 responses as unsupported regional coverage", async () => {
    globalThis.fetch = async () => createJsonResponse({}, { status: 400 });

    const result = await fetchSevereWeatherAlerts(35.6762, 139.6503);

    assert.equal(result.status, ALERTS_STATUS.unsupported);
    assert.deepEqual(result.alerts, []);
  });

  test("marks non-coverage failures as temporarily unavailable", async () => {
    globalThis.fetch = async () => createJsonResponse({}, { status: 503 });

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.status, ALERTS_STATUS.unavailable);
    assert.deepEqual(result.alerts, []);
  });
});

describe("fetchHistoricalTemperatureAverage", () => {
  test("ignores null and empty-string samples instead of averaging them as 0", async () => {
    // Historical archive responses can contain null entries when a
    // station was offline. The Phase 1 strict-coercion contract must
    // hold here: missing samples drop out of the average rather than
    // pulling it toward 0°F.
    globalThis.fetch = async () =>
      createJsonResponse({
        daily: {
          time: [
            "1995-05-02",
            "1996-05-02",
            "1997-05-02",
            "1998-05-02",
            "1999-05-02",
          ],
          temperature_2m_mean: [60, null, 62, "", 64],
          temperature_2m_min: [50, 52, 54, 56, 58],
          temperature_2m_max: [70, 72, 74, 76, 80],
        },
      });

    const result = await fetchHistoricalTemperatureAverage(
      41.8781,
      -87.6298,
      "America/Chicago"
    );

    assert.ok(result, "expected an averaged result");
    // Real means: 60, 62, 64. Null + empty samples fall back to
    // (min+max)/2 = 62 and 66. So the average is (60+62+62+66+64)/5 = 62.8.
    assert.equal(result.averageTemperature, 62.8);
    assert.equal(result.sampleYears, 5);
  });

  test("returns null when the archive returns no usable samples", async () => {
    globalThis.fetch = async () =>
      createJsonResponse({
        daily: {
          time: ["1995-05-02"],
          temperature_2m_mean: [null],
          temperature_2m_min: [null],
          temperature_2m_max: [null],
        },
      });

    const result = await fetchHistoricalTemperatureAverage(
      41.8781,
      -87.6298,
      "America/Chicago"
    );

    assert.equal(result, null);
  });
});
