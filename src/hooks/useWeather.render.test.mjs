import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, act, waitFor } = await import("@testing-library/react");
const { useWeather } = await import("./useWeather.js");

const originalGeolocation = navigator.geolocation;
const realFetch = globalThis.fetch;

function setGeolocation(value) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value,
  });
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Minimal but schema-valid Open-Meteo forecast payload: normalizeWeatherResponse
// only needs `current` plus the array bags to be present.
function forecastPayload(latitude, longitude) {
  return {
    latitude,
    longitude,
    timezone: "UTC",
    current: {
      temperature_2m: 60,
      relative_humidity_2m: 50,
      apparent_temperature: 60,
      weather_code: 2,
      wind_speed_10m: 5,
      wind_gusts_10m: 8,
      wind_direction_10m: 200,
      surface_pressure: 1012,
      dew_point_2m: 45,
      cloud_cover: 30,
      visibility: 10000,
    },
    hourly: {
      time: [],
      temperature_2m: [],
      weather_code: [],
      precipitation_probability: [],
      precipitation: [],
      surface_pressure: [],
      cape: [],
      wind_gusts_10m: [],
    },
    daily: {
      time: ["2026-04-21"],
      weather_code: [2],
      temperature_2m_max: [67],
      temperature_2m_min: [51],
      sunrise: ["2026-04-21T11:18:00Z"],
      sunset: ["2026-04-21T23:41:00Z"],
      uv_index_max: [6],
      precipitation_probability_max: [20],
      precipitation_sum: [0],
      wind_speed_10m_max: [12],
      wind_gusts_10m_max: [18],
      wind_direction_10m_dominant: [200],
    },
    minutely_15: {
      time: [],
      weather_code: [],
      precipitation_probability: [],
      precipitation: [],
    },
  };
}

// Reverse-geocode resolves on the first microtask (no awaited hops), so it
// wins the race against the forecast fetch — the exact ordering that strands
// the dashboard in global loading when triggered via a 0ms e2e mock.
function installImmediateFetch() {
  globalThis.fetch = (input) => {
    const url = String(input?.url ?? input ?? "");
    const parsed = new URL(url, "http://localhost/");
    if (parsed.hostname === "api.open-meteo.com") {
      const lat = Number(parsed.searchParams.get("latitude"));
      const lon = Number(parsed.searchParams.get("longitude"));
      return Promise.resolve(
        jsonResponse(
          forecastPayload(
            Number.isFinite(lat) ? lat : 41.8781,
            Number.isFinite(lon) ? lon : -87.6298
          )
        )
      );
    }
    if (parsed.hostname === "api.bigdatacloud.net") {
      return Promise.resolve(
        jsonResponse({
          city: "Crystal Lake",
          locality: "Crystal Lake",
          principalSubdivision: "",
          countryName: "United States",
        })
      );
    }
    if (parsed.hostname === "air-quality-api.open-meteo.com") {
      return Promise.resolve(jsonResponse({ current: { european_aqi: 42 } }));
    }
    if (parsed.hostname === "archive-api.open-meteo.com") {
      return Promise.resolve(
        jsonResponse({
          daily: {
            time: [],
            temperature_2m_mean: [],
            temperature_2m_min: [],
            temperature_2m_max: [],
          },
        })
      );
    }
    if (parsed.hostname === "api.weather.gov") {
      return Promise.resolve(
        jsonResponse({ type: "FeatureCollection", features: [] })
      );
    }
    return Promise.resolve(jsonResponse({}));
  };
}

function WeatherProbe({ onState }) {
  const api = useWeather({ climateEnabled: false });
  React.useEffect(() => {
    onState(api);
  });
  return null;
}

afterEach(() => {
  cleanup();
  setGeolocation(originalGeolocation);
  globalThis.fetch = realFetch;
  window.localStorage.clear();
});

describe("useWeather current-location recovery", () => {
  test("recovers (does not stay stuck loading) when reverse-geocode resolves before the forecast", async () => {
    window.localStorage.clear();
    installImmediateFetch();
    setGeolocation({
      getCurrentPosition(onSuccess) {
        onSuccess({ coords: { latitude: 42.1234, longitude: -88.5678 } });
      },
      watchPosition() {
        return 0;
      },
      clearWatch() {},
    });

    let latest = null;
    await act(async () => {
      render(
        React.createElement(WeatherProbe, {
          onState: (api) => {
            latest = api;
          },
        })
      );
    });

    // The default (Chicago) forecast settles first.
    await waitFor(() => {
      assert.ok(latest?.weather, "initial forecast loads");
      assert.equal(latest.loading, false);
    });

    await act(async () => {
      latest.loadCurrentLocation();
    });

    // After granting location with a fast reverse-geocode, the dashboard must
    // land on the resolved place with live weather — never a permanent
    // weather=null + loading=true (global loading) state.
    await waitFor(() => {
      assert.equal(latest.location?.name, "Crystal Lake");
      assert.ok(
        latest.weather,
        "weather present after current-location resolve (not stranded in loading)"
      );
      assert.equal(latest.loading, false, "not stuck in loading");
    });
  });
});
