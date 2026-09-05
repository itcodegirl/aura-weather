import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { reverseGeocode } from "./reverseGeocode.js";

const realFetch = globalThis.fetch;

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("reverseGeocode", () => {
  test("returns the city + country for a normal response", async () => {
    let requestUrl = null;
    globalThis.fetch = async (url) => {
      requestUrl = new URL(String(url));
      return jsonResponse({
        city: "Palos Hills",
        locality: "Palos Hills",
        principalSubdivision: "Illinois",
        countryName: "United States",
      });
    };

    const result = await reverseGeocode(41.7, -87.82);

    assert.deepEqual(result, { name: "Palos Hills", country: "United States" });
    assert.equal(
      requestUrl?.origin + requestUrl?.pathname,
      "https://api.bigdatacloud.net/data/reverse-geocode-client"
    );
    assert.equal(requestUrl?.searchParams.get("latitude"), "41.7");
    assert.equal(requestUrl?.searchParams.get("longitude"), "-87.82");
    assert.equal(requestUrl?.searchParams.get("localityLanguage"), "en");
  });

  test("names places in English whatever language a caller prefers", async () => {
    // Guards the deliberate choice, not an accident: the adapter and the
    // city search must agree on a naming language or the same place lands
    // twice in the saved-cities strip. A future `language` option has to
    // change this test, which is the point -- it forces the search side to
    // be considered at the same time.
    let requestUrl = null;
    globalThis.fetch = async (url) => {
      requestUrl = new URL(String(url));
      return jsonResponse({ city: "Munich", countryName: "Germany" });
    };

    const result = await reverseGeocode(48.14, 11.58, {
      language: "de-DE,de",
    });

    assert.deepEqual(result, { name: "Munich", country: "Germany" });
    assert.equal(requestUrl?.searchParams.get("localityLanguage"), "en");
    assert.deepEqual(
      [...requestUrl.searchParams.keys()].sort(),
      ["latitude", "localityLanguage", "longitude"],
      "no language-bearing parameter reaches the provider"
    );
  });

  test("falls back from city → locality → subdivision when earlier fields are blank", async () => {
    globalThis.fetch = async () =>
      jsonResponse({
        city: "   ",
        locality: "",
        principalSubdivision: "Bavaria",
        countryName: "Germany",
      });

    const result = await reverseGeocode(48.1, 11.6);
    assert.deepEqual(result, { name: "Bavaria", country: "Germany" });
  });

  test("returns null when the response has no usable place name", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ city: "", locality: "", principalSubdivision: "" });

    assert.equal(await reverseGeocode(0.1, 0.1), null);
  });

  test("returns null on a non-OK status", async () => {
    globalThis.fetch = async () => jsonResponse({}, { status: 503 });
    assert.equal(await reverseGeocode(41.7, -87.82), null);
  });

  test("returns null when the network request fails", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    assert.equal(await reverseGeocode(41.7, -87.82), null);
  });

  test("returns null when the body is not valid JSON", async () => {
    globalThis.fetch = async () =>
      new Response("<!doctype html>not json", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    assert.equal(await reverseGeocode(41.7, -87.82), null);
  });

  test("returns null for invalid coordinates without making a request", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    assert.equal(await reverseGeocode(null, undefined), null);
    assert.equal(await reverseGeocode("nope", 12), null);
    assert.equal(called, false);
  });

  test("propagates an explicit abort so callers can stop a stale chain", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    globalThis.fetch = async () => {
      throw abortError;
    };

    await assert.rejects(() => reverseGeocode(41.7, -87.82), /aborted/);
  });
});
