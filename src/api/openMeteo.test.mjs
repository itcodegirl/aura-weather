import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERTS_STATUS,
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
