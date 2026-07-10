import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveWeatherScene } from "./weatherScene.js";

describe("weather scene derivation", () => {
  test("returns loading state before weather arrives", () => {
    const scene = deriveWeatherScene({
      weather: null,
      loading: true,
      error: null,
    });

    assert.equal(scene.showGlobalLoading, true);
    assert.equal(scene.showGlobalError, false);
    assert.equal(scene.isBackgroundLoading, false);
    assert.equal(scene.showRefreshError, false);
    assert.equal(typeof scene.background, "string");
    assert.equal(scene.background.includes("linear-gradient"), true);
  });

  test("returns refresh-error state when weather exists", () => {
    const scene = deriveWeatherScene({
      weather: { current: { conditionCode: 95 } },
      loading: false,
      error: "network",
    });

    assert.equal(scene.showGlobalLoading, false);
    assert.equal(scene.showGlobalError, false);
    assert.equal(scene.isBackgroundLoading, false);
    assert.equal(scene.showRefreshError, true);
    assert.equal(scene.weatherInfo.label, "Thunderstorm");
  });

  test("returns global error state when there is no weather and an error", () => {
    const scene = deriveWeatherScene({
      weather: null,
      loading: false,
      error: "Could not load weather",
    });

    assert.equal(scene.showGlobalLoading, false);
    assert.equal(scene.showGlobalError, true);
    assert.equal(scene.showRefreshError, false);
    assert.equal(scene.isBackgroundLoading, false);
  });

  test("returns background-loading state when weather already exists", () => {
    const scene = deriveWeatherScene({
      weather: { current: { conditionCode: 1 } },
      loading: true,
      error: null,
    });

    assert.equal(scene.showGlobalLoading, false);
    assert.equal(scene.isBackgroundLoading, true);
    assert.equal(scene.showRefreshError, false);
    assert.equal(scene.showGlobalError, false);
    assert.equal(scene.weatherInfo.label, "Mostly Clear");
  });

  test("reports an unknown scene when weather lacks a condition code", () => {
    const scene = deriveWeatherScene({
      weather: { current: {} },
      loading: false,
      error: null,
    });

    // Arrived with data but no condition code: say so, rather than
    // painting a clear sky we have no evidence for.
    assert.equal(scene.weatherInfo.label, "Not reported");
    assert.ok(scene.background.startsWith("linear-gradient("));
    assert.equal(scene.showGlobalLoading, false);
    assert.equal(scene.showGlobalError, false);
  });
});
