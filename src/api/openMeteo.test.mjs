import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERTS_STATUS,
  fetchAirQuality,
  geocodeCity,
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

  test("retries transient forecast failures before returning current conditions", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return createJsonResponse({}, { status: 503 });
      }
      return createJsonResponse({
        latitude: 41.8781,
        longitude: -87.6298,
        timezone: "America/Chicago",
        current: {
          temperature_2m: 67,
        },
        hourly: {},
        daily: {},
        minutely_15: {},
      });
    };

    const result = await fetchWeather(41.8781, -87.6298, {
      retryDelaysMs: [0],
    });

    assert.equal(result.current.temperature, 67);
    assert.equal(requestCount, 2);
  });

  test("retries transient geocoding failures before returning suggestions", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return createJsonResponse({}, { status: 429 });
      }
      return createJsonResponse({
        results: [
          {
            id: 4887398,
            name: "Chicago",
            latitude: 41.8781,
            longitude: -87.6298,
            country: "United States",
          },
        ],
      });
    };

    const results = await geocodeCity("chicago", { retryDelaysMs: [0] });

    assert.equal(results[0].name, "Chicago");
    assert.equal(requestCount, 2);
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

  test("does not retry unsupported alert coverage responses", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      return createJsonResponse({}, { status: 400 });
    };

    const result = await fetchSevereWeatherAlerts(35.6762, 139.6503, {
      retryDelaysMs: [0],
    });

    assert.equal(result.status, ALERTS_STATUS.unsupported);
    assert.equal(requestCount, 1);
  });

  test("retries transient alert failures before returning data", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return createJsonResponse({}, { status: 503 });
      }
      return createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "wind-advisory",
                event: "Wind Advisory",
                severity: "Moderate",
                urgency: "Expected",
              },
            },
          ],
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/geo+json",
          },
        }
      );
    };

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298, {
      retryDelaysMs: [0],
    });

    assert.equal(result.status, ALERTS_STATUS.ready);
    assert.equal(result.alerts[0].id, "wind-advisory");
    assert.equal(requestCount, 2);
  });
});

describe("fetchAirQuality", () => {
  test("retries transient AQI failures before returning a reading", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return createJsonResponse({}, { status: 502 });
      }
      return createJsonResponse({
        current: {
          european_aqi: 42,
        },
      });
    };

    const result = await fetchAirQuality(41.8781, -87.6298, {
      retryDelaysMs: [0],
    });

    assert.equal(result, 42);
    assert.equal(requestCount, 2);
  });
});

describe("fetchHistoricalTemperatureAverage", () => {
  // The function under test computes the target month-day suffix from
  // the system clock at call time, then filters archive entries by
  // that suffix. Build the mock entries against today's clock so the
  // tests do not silently start failing on a calendar-day boundary.
  function buildArchiveTimes(yearOffsets) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const month = parts.find((part) => part.type === "month").value;
    const day = parts.find((part) => part.type === "day").value;
    const baseYear = Number(parts.find((part) => part.type === "year").value);
    return yearOffsets.map(
      (offset) => `${baseYear - offset}-${month}-${day}`
    );
  }

  test("ignores null and empty-string samples instead of averaging them as 0", async () => {
    // Historical archive responses can contain null entries when a
    // station was offline. The strict-coercion contract must hold
    // here: missing samples drop out of the average rather than
    // pulling it toward 0°F.
    globalThis.fetch = async () =>
      createJsonResponse({
        daily: {
          time: buildArchiveTimes([5, 4, 3, 2, 1]),
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
          time: buildArchiveTimes([1]),
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

  test("retries transient archive failures before building the comparison", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return createJsonResponse({}, { status: 503 });
      }
      return createJsonResponse({
        daily: {
          time: buildArchiveTimes([2, 1]),
          temperature_2m_mean: [60, 64],
          temperature_2m_min: [50, 52],
          temperature_2m_max: [70, 76],
        },
      });
    };

    const result = await fetchHistoricalTemperatureAverage(
      41.8781,
      -87.6298,
      "America/Chicago",
      { retryDelaysMs: [0] }
    );

    assert.equal(result.averageTemperature, 62);
    assert.equal(requestCount, 2);
  });
});
