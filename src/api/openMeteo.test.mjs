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

// A fetch that never settles on its own: it rejects only if the request's
// signal aborts. Anything the request layer forgets to bound therefore hangs,
// which is what the timeout tests need to be able to observe.
function createStallingFetch(onRequest) {
  return (url, init = {}) =>
    new Promise((_resolve, reject) => {
      onRequest?.(init);
      const signal = init.signal;
      if (!signal) {
        return;
      }
      const rejectWithReason = () => {
        reject(signal.reason ?? new Error("aborted"));
      };
      if (signal.aborted) {
        rejectWithReason();
        return;
      }
      signal.addEventListener("abort", rejectWithReason, { once: true });
    });
}

// Fails loudly instead of hanging forever when the code under test loses its
// timeout — a hung promise would otherwise stall the whole run.
async function captureRejection(promise, watchdogMs = 4_000) {
  let watchdogId = null;
  const watchdog = new Promise((_resolve, reject) => {
    watchdogId = setTimeout(() => {
      reject(new Error(`request did not settle within ${watchdogMs}ms`));
    }, watchdogMs);
  });

  try {
    await Promise.race([promise, watchdog]);
  } catch (error) {
    return error;
  } finally {
    clearTimeout(watchdogId);
  }

  throw new Error("expected the request to reject");
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

  test("severe alert with future urgency gets high priority (not moderate)", async () => {
    globalThis.fetch = async () =>
      createJsonResponse({
        features: [
          {
            properties: {
              id: "flood-watch",
              event: "Flood Watch",
              severity: "Severe",
              urgency: "Future",
              expires: "2026-06-17T21:00:00Z",
            },
          },
        ],
      }, {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });

    const result = await fetchSevereWeatherAlerts(41.698, -87.8349);

    assert.equal(result.alerts[0].priority, "high");
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
          us_aqi: 42,
        },
      });
    };

    const result = await fetchAirQuality(41.8781, -87.6298, {
      retryDelaysMs: [0],
    });

    assert.equal(result, 42);
    assert.equal(requestCount, 2);
  });

  test("requests the US EPA index, not the European one", async () => {
    // The app classifies AQI with EPA breakpoints and draws the gauge as a
    // fraction of 500. european_aqi is a different index on a different scale
    // (0-20 good, 60-80 poor), so feeding it to those thresholds understated
    // the risk on the only health-relevant reading in the app.
    let requestedUrl = "";
    globalThis.fetch = async (url) => {
      requestedUrl = String(url);
      return createJsonResponse({ current: { us_aqi: 156 } });
    };

    const result = await fetchAirQuality(41.8781, -87.6298);

    assert.match(requestedUrl, /current=us_aqi/);
    assert.doesNotMatch(requestedUrl, /european_aqi/);
    assert.equal(result, 156);
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

describe("request timeout budget", () => {
  test("bounds a stalled forecast by the whole-request budget, not by the summed attempt timeouts", async () => {
    // The timeout used to be created per attempt, so a stall ran
    // (attempts x timeout) + backoff — ~31s in production — before the UI said
    // the request had "timed out". The budget now covers the retry sequence.
    let attempts = 0;
    globalThis.fetch = createStallingFetch(() => {
      attempts += 1;
    });

    const startedAt = Date.now();
    const error = await captureRejection(
      fetchWeather(41.8781, -87.6298, {
        retryDelaysMs: [20, 20],
        timeoutMs: 150,
        totalTimeoutMs: 250,
      })
    );
    const elapsedMs = Date.now() - startedAt;

    assert.equal(error.name, "TimeoutError");
    assert.ok(attempts >= 2, `expected the stall to be retried, saw ${attempts}`);
    // Summed per-attempt budgets would be 3 x 150 + 40 = 490ms.
    assert.ok(
      elapsedMs < 400,
      `expected the whole request within the 250ms budget, took ${elapsedMs}ms`
    );
  });

  test("keeps the timeout on engines without AbortSignal.any", async () => {
    // Safari <17 / Firefox <115. The old composition returned the caller's
    // signal alone there, dropping the timeout — and useWeatherData always
    // passes a caller signal, so every forecast ran unbounded.
    const realAny = AbortSignal.any;
    delete AbortSignal.any;
    const controller = new AbortController();
    globalThis.fetch = createStallingFetch();

    try {
      const error = await captureRejection(
        fetchWeather(41.8781, -87.6298, {
          signal: controller.signal,
          retryDelaysMs: [],
          timeoutMs: 80,
          totalTimeoutMs: 200,
        })
      );

      assert.equal(error.name, "TimeoutError");
    } finally {
      AbortSignal.any = realAny;
    }
  });

  test("still honors a caller abort on engines without AbortSignal.any", async () => {
    const realAny = AbortSignal.any;
    delete AbortSignal.any;
    const controller = new AbortController();
    let attempts = 0;
    globalThis.fetch = createStallingFetch(() => {
      attempts += 1;
      setTimeout(() => controller.abort(), 20);
    });

    try {
      const error = await captureRejection(
        fetchWeather(41.8781, -87.6298, {
          signal: controller.signal,
          retryDelaysMs: [20],
          timeoutMs: 2_000,
          totalTimeoutMs: 4_000,
        })
      );

      assert.equal(error.name, "AbortError");
      assert.equal(attempts, 1);
    } finally {
      AbortSignal.any = realAny;
    }
  });

  test("does not retry a caller abort and keeps it distinct from a timeout", async () => {
    // AbortSignal.timeout rejects with TimeoutError, not AbortError. The retry
    // policy and the failure copy both read that distinction: a timeout is
    // retried and reported as a timeout, a user abort is neither.
    const controller = new AbortController();
    let attempts = 0;
    globalThis.fetch = createStallingFetch(() => {
      attempts += 1;
      setTimeout(() => controller.abort(), 20);
    });

    const error = await captureRejection(
      fetchWeather(41.8781, -87.6298, {
        signal: controller.signal,
        retryDelaysMs: [20, 20],
        timeoutMs: 2_000,
        totalTimeoutMs: 4_000,
      })
    );

    assert.equal(error.name, "AbortError");
    assert.notEqual(error.name, "TimeoutError");
    assert.equal(attempts, 1);
  });

  test("folds a stalled supplemental request into a null reading, not a hang", async () => {
    // fetchAirQuality swallows failures into null and rethrows only a caller
    // abort, so a timeout has to actually fire for the panel to degrade.
    globalThis.fetch = createStallingFetch();

    const reading = await Promise.race([
      fetchAirQuality(41.8781, -87.6298, {
        retryDelaysMs: [],
        timeoutMs: 60,
        totalTimeoutMs: 120,
      }),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("AQI request never settled")), 4_000);
      }),
    ]);

    assert.equal(reading, null);
  });
});
