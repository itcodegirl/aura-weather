import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getAqiStatus, getUvStatus } from "./exposure.js";

describe("getAqiStatus", () => {
  test("returns no-data status for null/undefined", () => {
    const status = getAqiStatus(null);
    assert.equal(status.label, "");
    assert.equal(typeof status.color, "string");

    const undefinedStatus = getAqiStatus(undefined);
    assert.equal(undefinedStatus.label, "");
  });

  test("classifies the AQI bands across the real EPA 6-tier scale", () => {
    // EPA standard tier breakpoints. The previous 3-bucket model
    // collapsed everything above 100 into one 'Unhealthy' bin; the
    // refined model preserves the actionable distinctions sensitive-
    // group and asthma-aware readers need.
    assert.equal(getAqiStatus(0).label, "Good");
    assert.equal(getAqiStatus(50).label, "Good");
    assert.equal(getAqiStatus(51).label, "Moderate");
    assert.equal(getAqiStatus(100).label, "Moderate");
    assert.equal(getAqiStatus(101).label, "Sensitive");
    assert.equal(getAqiStatus(150).label, "Sensitive");
    assert.equal(getAqiStatus(151).label, "Unhealthy");
    assert.equal(getAqiStatus(200).label, "Unhealthy");
    assert.equal(getAqiStatus(201).label, "Very Unhealthy");
    assert.equal(getAqiStatus(300).label, "Very Unhealthy");
    assert.equal(getAqiStatus(301).label, "Hazardous");
    assert.equal(getAqiStatus(450).label, "Hazardous");
    assert.equal(getAqiStatus(500).label, "Hazardous");
  });

  test("returns distinct colors across every tier", () => {
    // Six distinct colors — one per tier — so a sighted user can
    // visually identify the severity from the gauge fill alone.
    const colors = new Set([
      getAqiStatus(25).color,
      getAqiStatus(75).color,
      getAqiStatus(125).color,
      getAqiStatus(175).color,
      getAqiStatus(250).color,
      getAqiStatus(400).color,
    ]);
    assert.equal(colors.size, 6);
  });

  test("returns a label string short enough to render in the metric pill without wrapping", () => {
    // Pill width is constrained on narrow viewports. The pill text on
    // every tier should stay short (one or two words). 'Unhealthy for
    // Sensitive Groups' (the EPA full label) is shortened to
    // 'Sensitive' here; the full explanation lives in the InfoDrawer.
    for (const aqi of [25, 75, 125, 175, 250, 400]) {
      const label = getAqiStatus(aqi).label;
      assert.ok(
        label.length <= 14,
        `tier label ${JSON.stringify(label)} must fit the pill (≤14 chars)`
      );
    }
  });
});

describe("getUvStatus", () => {
  test("returns no-data status for null/undefined", () => {
    assert.equal(getUvStatus(null).label, "");
    assert.equal(getUvStatus(undefined).label, "");
  });

  test("classifies UV bands across the WHO scale", () => {
    assert.equal(getUvStatus(0).label, "Low");
    assert.equal(getUvStatus(2).label, "Low");
    assert.equal(getUvStatus(3).label, "Moderate");
    assert.equal(getUvStatus(5).label, "Moderate");
    assert.equal(getUvStatus(6).label, "High");
    assert.equal(getUvStatus(7).label, "High");
    assert.equal(getUvStatus(8).label, "Very High");
    assert.equal(getUvStatus(10).label, "Very High");
    assert.equal(getUvStatus(11).label, "Extreme");
    assert.equal(getUvStatus(15).label, "Extreme");
  });

  test("returns distinct colors per band", () => {
    const colors = new Set([
      getUvStatus(1).color,
      getUvStatus(4).color,
      getUvStatus(6.5).color,
      getUvStatus(9).color,
      getUvStatus(11).color,
    ]);
    assert.equal(colors.size, 5);
  });
});
