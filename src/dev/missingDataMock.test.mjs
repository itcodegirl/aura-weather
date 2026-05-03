import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { installMissingDataMockIfRequested } from "./missingDataMock.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

function setLocationSearch(search) {
  globalThis.window = { location: { search } };
}

describe("installMissingDataMockIfRequested", () => {
  test("returns false and does not patch fetch when ?mock=missing is absent", () => {
    setLocationSearch("");
    globalThis.fetch = async () => new Response("real", { status: 200 });
    const installed = installMissingDataMockIfRequested();
    assert.equal(installed, false);
    // Fetch is still the unpatched stub we installed.
    const text = (async () => (await globalThis.fetch("http://example/")).text())();
    return text.then((body) => assert.equal(body, "real"));
  });

  test("returns true and patches fetch when ?mock=missing is present", () => {
    setLocationSearch("?mock=missing");
    globalThis.fetch = async () => new Response("real", { status: 200 });
    const installed = installMissingDataMockIfRequested();
    assert.equal(installed, true);
  });

  test("returns a forecast payload with null current readings when ?mock=missing is set", async () => {
    setLocationSearch("?mock=missing");
    globalThis.fetch = async () => new Response("should not be hit", { status: 200 });
    installMissingDataMockIfRequested();

    const response = await globalThis.fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=41.8781&longitude=-87.6298"
    );
    const payload = await response.json();
    assert.equal(payload.current.temperature_2m, 67.4);
    assert.equal(payload.current.relative_humidity_2m, null);
    assert.equal(payload.current.surface_pressure, null);
    assert.equal(payload.current.dew_point_2m, null);
    assert.equal(payload.current.apparent_temperature, null);
  });

  test("returns null AQI when ?mock=missing is set", async () => {
    setLocationSearch("?mock=missing");
    globalThis.fetch = async () => new Response("should not be hit", { status: 200 });
    installMissingDataMockIfRequested();

    const response = await globalThis.fetch(
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1&longitude=2"
    );
    const payload = await response.json();
    assert.equal(payload.current.european_aqi, null);
  });

  test("returns an empty NWS feature collection when ?mock=missing is set", async () => {
    setLocationSearch("?mock=missing");
    globalThis.fetch = async () => new Response("should not be hit", { status: 200 });
    installMissingDataMockIfRequested();

    const response = await globalThis.fetch(
      "https://api.weather.gov/alerts/active?point=41,-87"
    );
    const payload = await response.json();
    assert.equal(payload.type, "FeatureCollection");
    assert.deepEqual(payload.features, []);
  });

  test("forwards unknown URLs to the original fetch", async () => {
    setLocationSearch("?mock=missing");
    let receivedUrl = null;
    globalThis.fetch = async (url) => {
      receivedUrl = url;
      return new Response("forwarded", { status: 200 });
    };
    installMissingDataMockIfRequested();

    const response = await globalThis.fetch("https://example.com/other");
    const body = await response.text();
    assert.equal(body, "forwarded");
    assert.equal(receivedUrl, "https://example.com/other");
  });
});
