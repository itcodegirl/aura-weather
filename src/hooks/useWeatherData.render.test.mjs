import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup, act, waitFor } = await import("@testing-library/react");
const { useWeatherData } = await import("./useWeatherData.js");
const { readCachedWeatherSnapshot } = await import(
  "../services/weatherSnapshotCache.js"
);

const realFetch = globalThis.fetch;

const PROBE_LOCATION = { lat: 41.8781, lon: -87.6298, name: "Chicago" };

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
            Number.isFinite(lat) ? lat : PROBE_LOCATION.lat,
            Number.isFinite(lon) ? lon : PROBE_LOCATION.lon
          )
        )
      );
    }
    if (parsed.hostname === "air-quality-api.open-meteo.com") {
      return Promise.resolve(jsonResponse({ current: { european_aqi: 42 } }));
    }
    if (parsed.hostname === "api.weather.gov") {
      return Promise.resolve(
        jsonResponse({ type: "FeatureCollection", features: [] })
      );
    }
    return Promise.resolve(jsonResponse({}));
  };
}

function WeatherDataProbe({ location, onState }) {
  const api = useWeatherData(location, { climateEnabled: false });
  React.useEffect(() => {
    onState(api);
  });
  return null;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  window.localStorage.clear();
});

describe("useWeatherData supplemental merge", () => {
  test("merges AQI/alerts into weather and persists the merged snapshot", async () => {
    window.localStorage.clear();
    installImmediateFetch();

    let latest = null;
    await act(async () => {
      render(
        React.createElement(WeatherDataProbe, {
          location: PROBE_LOCATION,
          onState: (api) => {
            latest = api;
          },
        })
      );
    });

    await waitFor(() => {
      assert.ok(latest?.weather, "forecast loads");
      assert.equal(latest.loading, false);
      assert.equal(latest.weather.aqi, 42, "AQI merged into weather state");
      assert.equal(latest.weather.alertsStatus, "ready");
      assert.equal(latest.trustMeta.aqiStatus, "ready");
      assert.equal(latest.trustMeta.alertsStatus, "ready");
    });

    // The persisted snapshot must contain the *merged* weather, proving
    // the cache write still fires after the supplemental data lands
    // (it now happens outside the setWeather updater).
    const snapshot = readCachedWeatherSnapshot({
      latitude: PROBE_LOCATION.lat,
      longitude: PROBE_LOCATION.lon,
    });
    assert.ok(snapshot, "snapshot persisted");
    assert.equal(snapshot.weather.aqi, 42);
    assert.equal(snapshot.trustMeta.aqiStatus, "ready");
    assert.equal(snapshot.trustMeta.alertsStatus, "ready");
    assert.equal(snapshot.trustMeta.forecastStatus, "ready");
  });
});
