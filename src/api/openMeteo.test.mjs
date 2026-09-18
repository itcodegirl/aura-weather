import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

  /*
   * CAP `status`. NWS publishes drills on the same endpoint as real alerts —
   * a `Test Message` was live in the national feed on 2026-09-17 — and this
   * card renders what it is handed, so an unfiltered drill read as an active
   * hazard.
   */
  test("drops a Test transmission instead of rendering it as an active hazard", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "drill",
                event: "Test Message",
                status: "Test",
                severity: "Severe",
                urgency: "Immediate",
                expires: "2026-09-18T15:00:00Z",
              },
            },
            {
              properties: {
                id: "real-warning",
                event: "Tornado Warning",
                status: "Actual",
                severity: "Severe",
                urgency: "Immediate",
                expires: "2026-09-18T15:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].id, "real-warning");
  });

  test("drops Exercise, System and Draft transmissions too, and is case-insensitive", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: ["Exercise", "System", "Draft", "test", "ACTUAL"].map(
            (status, index) => ({
              properties: {
                id: `feature-${status}`,
                event: "Severe Thunderstorm Warning",
                status,
                severity: "Severe",
                urgency: "Immediate",
                expires: `2026-09-18T1${index}:00:00Z`,
              },
            })
          ),
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.deepEqual(
      result.alerts.map((alert) => alert.id),
      ["feature-ACTUAL"]
    );
  });

  /*
   * Deliberate asymmetry, and the reason it is named in the test rather than
   * only in the source: an absent `status` KEEPS the alert. CAP requires the
   * field and it was present on all 205 features sampled, so absence means a
   * malformed payload, not a drill — and dropping a real warning here is a
   * false all-clear, which is worse than showing a drill.
   */
  test("keeps an alert whose status is absent rather than assuming it is a drill", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "no-status",
                event: "Tornado Warning",
                severity: "Severe",
                urgency: "Immediate",
                expires: "2026-09-18T15:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].id, "no-status");
  });

  test("carries the protective action through to the normalised alert", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "with-instruction",
                event: "Severe Thunderstorm Warning",
                status: "Actual",
                severity: "Severe",
                urgency: "Immediate",
                expires: "2026-09-18T15:00:00Z",
                instruction:
                  "Seek shelter inside a well-built structure and stay away from\nwindows.",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.match(result.alerts[0].instruction, /Seek shelter/);
  });

  /*
   * `instruction` is absent on 40% of live alerts, so the empty-string
   * default is the common path, not an edge case. It must be a string:
   * `undefined` would reach the card and read as a missing prop rather than
   * a provider that said nothing.
   */
  test("an absent instruction normalises to an empty string, not undefined", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "no-instruction",
                event: "Small Craft Advisory",
                status: "Actual",
                severity: "Minor",
                urgency: "Expected",
                expires: "2026-09-18T15:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].instruction, "");
  });

  test("carries the CAP response token through to the normalised alert", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "with-response",
                event: "Tornado Warning",
                status: "Actual",
                severity: "Severe",
                urgency: "Immediate",
                expires: "2026-09-19T15:00:00Z",
                response: "Shelter",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    // Raw, not mapped: the vocabulary lives in domain/alertResponse.js so the
    // API layer stays free of user-facing words.
    assert.equal(result.alerts[0].response, "Shelter");
  });

  test("an absent response normalises to an empty string, not undefined", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "no-response",
                event: "Hydrologic Outlook",
                status: "Actual",
                severity: "Unknown",
                urgency: "Future",
                expires: "2026-09-19T15:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].response, "");
  });

  /*
   * Against the recorded payload rather than a hand-written one. The point of
   * AUD-000's fixtures is that the normaliser is exercised on shapes NWS
   * actually emits — a synthetic feature only proves the normaliser handles
   * what we remembered to invent.
   */
  test("normalises every field the card reads from the recorded live payload", async () => {
    const recorded = JSON.parse(
      readFileSync(
        new URL("./__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
        "utf8"
      )
    );

    globalThis.fetch = async () =>
      createJsonResponse(recorded, {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    // The Test transmission in the fixture is dropped; the rest survive.
    assert.equal(
      result.alerts.length,
      recorded.features.filter((f) => f.properties.status === "Actual").length
    );

    for (const alert of result.alerts) {
      for (const field of ["event", "headline", "area", "description", "instruction", "response"]) {
        assert.equal(
          typeof alert[field],
          "string",
          `${field} must be a string on every alert, never undefined`
        );
      }
    }

    // The fixture is asserted elsewhere to contain a response and an area on
    // its live features; this proves they reach the model rather than being
    // dropped between the payload and the card.
    assert.ok(result.alerts.some((alert) => alert.response !== ""));
    assert.ok(result.alerts.some((alert) => alert.area !== ""));
  });

  /*
   * `ends` and `expires` are different questions — the hazard end and the
   * message-refresh deadline — and `endsAt` used to carry the latter under
   * the former's name. Both expiry filters believed the name. Driven by the
   * recorded fixture so the values are the provider's.
   */
  test("normalises ends into endsAt and expires into expiresAt, as distinct fields", async () => {
    const recorded = JSON.parse(
      readFileSync(
        new URL("./__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
        "utf8"
      )
    );

    globalThis.fetch = async () =>
      createJsonResponse(recorded, {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);
    const byEvent = Object.fromEntries(result.alerts.map((a) => [a.event, a]));
    const raw = Object.fromEntries(
      recorded.features.map((f) => [f.properties.event, f.properties])
    );

    // The case the defect hid: ends is nine and a half hours after expires.
    const beach = byEvent["Beach Hazards Statement"];
    assert.ok(beach);
    assert.equal(beach.endsAt, raw["Beach Hazards Statement"].ends);
    assert.equal(beach.expiresAt, raw["Beach Hazards Statement"].expires);
    assert.notEqual(beach.endsAt, beach.expiresAt);
    assert.ok(Date.parse(beach.endsAt) > Date.parse(beach.expiresAt));

    // No ends in the payload -> endsAt is null, never expires masquerading.
    const statement = byEvent["Special Weather Statement"];
    assert.ok(statement);
    assert.equal(statement.endsAt, null);
    assert.equal(statement.expiresAt, raw["Special Weather Statement"].expires);
  });

  test("an absent ends normalises to null, not to the expiry and not to undefined", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "no-ends",
                event: "Special Weather Statement",
                status: "Actual",
                severity: "Moderate",
                urgency: "Expected",
                expires: "2026-09-19T15:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].endsAt, null);
    assert.equal(result.alerts[0].expiresAt, "2026-09-19T15:00:00Z");
  });

  /*
   * CAP `onset` is the hazard start; `effective` is the message issue time.
   * They differed on 169 of 243 live alerts. `onsetAt` is additive — the
   * `startsAt` field every existing consumer reads is untouched.
   */
  test("normalises onset into onsetAt without disturbing startsAt", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "future-onset",
                event: "Winter Storm Watch",
                status: "Actual",
                severity: "Moderate",
                urgency: "Future",
                effective: "2026-09-18T12:00:00Z",
                onset: "2026-09-19T12:00:00Z",
                expires: "2026-09-18T18:00:00Z",
                ends: "2026-09-20T00:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].onsetAt, "2026-09-19T12:00:00Z");
    assert.equal(result.alerts[0].startsAt, "2026-09-18T12:00:00Z");
    assert.notEqual(result.alerts[0].onsetAt, result.alerts[0].startsAt);
  });

  test("an absent onset normalises to null, not to the effective time and not to undefined", async () => {
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "no-onset",
                event: "Hydrologic Outlook",
                status: "Actual",
                severity: "Unknown",
                urgency: "Future",
                effective: "2026-09-18T12:00:00Z",
                expires: "2026-09-19T12:00:00Z",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    // The fallback to `effective` is the CALLER's, not the normaliser's:
    // the model reports what the provider said.
    assert.equal(result.alerts[0].onsetAt, null);
    assert.equal(result.alerts[0].startsAt, "2026-09-18T12:00:00Z");
  });

  test("a JSON null onset does not become the string 'null'", async () => {
    // The recorded Test Message carries `"onset": null` verbatim.
    globalThis.fetch = async () =>
      createJsonResponse(
        {
          features: [
            {
              properties: {
                id: "null-onset",
                event: "Test Message",
                status: "Actual",
                severity: "Unknown",
                urgency: "Unknown",
                effective: "2026-09-18T02:33:09+00:00",
                onset: null,
                expires: "2026-09-19T02:33:09+00:00",
              },
            },
          ],
        },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].onsetAt, null);
  });
});

describe("fetchSevereWeatherAlerts — geometry", () => {
  /*
   * `geometry` is the one field on the alert model that comes from outside
   * `properties`. It is kept in the provider's own GeoJSON order — the swap
   * into Leaflet's [lat, lon] is domain/alertGeometry.js's job at draw time,
   * and this model is what gets persisted to the snapshot cache.
   */
  const alertWith = (geometry) => ({
    ...(geometry === undefined ? {} : { geometry }),
    properties: {
      id: "geo-alert",
      event: "Severe Thunderstorm Warning",
      status: "Actual",
      severity: "Severe",
      urgency: "Immediate",
      effective: "2026-09-18T12:00:00Z",
      expires: "2026-09-18T18:00:00Z",
    },
  });

  const respondWith = (feature) => {
    globalThis.fetch = async () =>
      createJsonResponse(
        { features: [feature] },
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );
  };

  const RING = [
    [-102.6, 41.52],
    [-102.64, 41.62],
    [-102.3, 41.82],
    [-102.6, 41.52],
  ];

  test("carries a drawable Polygon through in GeoJSON order, unswapped", async () => {
    respondWith(alertWith({ type: "Polygon", coordinates: [RING] }));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.deepEqual(result.alerts[0].geometry, { type: "Polygon", coordinates: [RING] });
    assert.deepEqual(
      result.alerts[0].geometry.coordinates[0][0],
      [-102.6, 41.52],
      "longitude still first — the model records what the provider sent"
    );
  });

  test("a zone-issued alert records null geometry, not a missing field", async () => {
    respondWith(alertWith(null));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].geometry, null);
    assert.ok(
      "geometry" in result.alerts[0],
      "the key must be present so a restored pre-geometry alert stays distinguishable"
    );
  });

  test("an absent geometry key normalises to null rather than undefined", async () => {
    respondWith(alertWith(undefined));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].geometry, null);
    assert.ok("geometry" in result.alerts[0]);
  });

  test("a MultiPolygon is recorded as no geometry — not drawn, rather than drawn in part", async () => {
    respondWith(alertWith({ type: "MultiPolygon", coordinates: [[RING]] }));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].geometry, null);
  });

  test("a malformed vertex voids the whole geometry", async () => {
    const broken = [[-102.6, 41.52], [-102.64, null], [-102.3, 41.82], [-102.6, 41.52]];
    respondWith(alertWith({ type: "Polygon", coordinates: [broken] }));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);

    assert.equal(result.alerts[0].geometry, null);
  });

  test("geometry does not disturb the fields already on the model", async () => {
    respondWith(alertWith({ type: "Polygon", coordinates: [RING] }));

    const result = await fetchSevereWeatherAlerts(41.8781, -87.6298);
    const alert = result.alerts[0];

    assert.equal(alert.id, "geo-alert");
    assert.equal(alert.event, "Severe Thunderstorm Warning");
    assert.equal(alert.startsAt, "2026-09-18T12:00:00Z");
    assert.equal(alert.expiresAt, "2026-09-18T18:00:00Z");
    assert.equal(alert.priority, "high");
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

  test("requests the daily maximum only, the field the comparison uses", async () => {
    // Audit finding E-03: the request pulled the mean, minimum and
    // maximum for 30 years to keep 30 samples of the mean. The hero
    // compares today's high with the average high, so one field is
    // enough — a third of the payload.
    let requestUrl = null;
    globalThis.fetch = async (input) => {
      requestUrl = new URL(typeof input === "string" ? input : input.url);
      return createJsonResponse({
        daily: {
          time: buildArchiveTimes([2, 1]),
          temperature_2m_max: [70, 76],
        },
      });
    };

    await fetchHistoricalTemperatureAverage(41.8781, -87.6298, "America/Chicago");

    assert.equal(requestUrl.searchParams.get("daily"), "temperature_2m_max");
  });

  test("ignores null and empty-string samples instead of averaging them as 0", async () => {
    // Historical archive responses can contain null entries when a
    // station was offline. The strict-coercion contract must hold
    // here: missing samples drop out of the average rather than
    // pulling it toward 0°F.
    globalThis.fetch = async () =>
      createJsonResponse({
        daily: {
          time: buildArchiveTimes([5, 4, 3, 2, 1]),
          temperature_2m_max: [70, null, 74, "", 80],
        },
      });

    const result = await fetchHistoricalTemperatureAverage(
      41.8781,
      -87.6298,
      "America/Chicago"
    );

    assert.ok(result, "expected an averaged result");
    // Three real highs: (70 + 74 + 80) / 3 = 74.67, to one decimal.
    assert.equal(result.averageHighTemperature, 74.7);
    assert.equal(result.sampleYears, 3);
  });

  test("returns null when the archive returns no usable samples", async () => {
    globalThis.fetch = async () =>
      createJsonResponse({
        daily: {
          time: buildArchiveTimes([1]),
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

    assert.equal(result.averageHighTemperature, 73);
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
