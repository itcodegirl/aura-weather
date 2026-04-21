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
});
