import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { getAqiStatus, getUvStatus } from "./meteorology.js";

describe("getAqiStatus", () => {
  test("returns no-data status for null/undefined", () => {
    const status = getAqiStatus(null);
    assert.equal(status.label, "");
    assert.equal(typeof status.color, "string");

    const undefinedStatus = getAqiStatus(undefined);
    assert.equal(undefinedStatus.label, "");
  });

  test("classifies the AQI bands correctly", () => {
    assert.equal(getAqiStatus(0).label, "Good");
    assert.equal(getAqiStatus(50).label, "Good");
    assert.equal(getAqiStatus(51).label, "Moderate");
    assert.equal(getAqiStatus(100).label, "Moderate");
    assert.equal(getAqiStatus(101).label, "Unhealthy");
    assert.equal(getAqiStatus(300).label, "Unhealthy");
  });

  test("returns distinct colors per band", () => {
    const colors = new Set([
      getAqiStatus(25).color,
      getAqiStatus(75).color,
      getAqiStatus(150).color,
    ]);
    assert.equal(colors.size, 3);
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
