import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getAqiStatus,
  getAqiGuidance,
  getUvStatus,
  classifyUv,
} from "./exposure.js";

describe("getAqiStatus", () => {
  test("returns no-data status for null/undefined", () => {
    const status = getAqiStatus(null);
    assert.equal(status.label, "");
    // A missing reading has no tone: the arc draws its dashed empty track and
    // never strokes a fill. Anything else would colour an absent measurement.
    assert.equal(status.tone, null);

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

  test("returns distinct tones across every tier", () => {
    // Six distinct tones — one per tier — so a sighted user can visually
    // identify the severity from the gauge fill alone. The tones carry that
    // promise now; AtmosphereBento.arcTones.test.mjs checks the CSS keeps it
    // by resolving all six to different colours.
    const tones = new Set([
      getAqiStatus(25).tone,
      getAqiStatus(75).tone,
      getAqiStatus(125).tone,
      getAqiStatus(175).tone,
      getAqiStatus(250).tone,
      getAqiStatus(400).tone,
    ]);
    assert.equal(tones.size, 6);
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

  test("returns distinct tones per band", () => {
    const tones = new Set([
      getUvStatus(1).tone,
      getUvStatus(4).tone,
      getUvStatus(6.5).tone,
      getUvStatus(9).tone,
      getUvStatus(11).tone,
    ]);
    assert.equal(tones.size, 5);
  });

  test("carries no presentation colour on any band", () => {
    // Same defect as classifyStormRisk and classifyComfort: the hexes here
    // were a copy of the --risk-* ramp, and the AQI set restated five of its
    // six stops byte-for-byte. Guarding the absence stops one creeping back
    // and re-forking the source of truth.
    for (const uv of [null, 1, 4, 6.5, 9, 11]) {
      assert.deepEqual(Object.keys(getUvStatus(uv)).sort(), ["label", "tone"]);
    }
    for (const aqi of [null, 25, 75, 125, 175, 250, 400]) {
      assert.deepEqual(Object.keys(getAqiStatus(aqi)).sort(), ["label", "tone"]);
    }
  });
});

describe("classifyUv", () => {
  test("returns null for a missing reading — absent UV is not Low UV", () => {
    assert.equal(classifyUv(null), null);
    assert.equal(classifyUv(undefined), null);
  });

  test("bands are half-open on the minimums, so fractional readings never straddle", () => {
    // These edges are exactly where five hand-copied thresholds used to
    // disagree (a 6.5 rendered Moderate, "UV high", and "UV High" at
    // once). Fractions just below a minimum stay in the lower band;
    // the minimum itself promotes.
    assert.equal(classifyUv(2.9).band, "low");
    assert.equal(classifyUv(3).band, "moderate");
    assert.equal(classifyUv(5.9).band, "moderate");
    assert.equal(classifyUv(6).band, "high");
    assert.equal(classifyUv(7.9).band, "high");
    assert.equal(classifyUv(8).band, "very-high");
    assert.equal(classifyUv(10.9).band, "very-high");
    assert.equal(classifyUv(11).band, "extreme");
  });

  test("carries a display label alongside the band key", () => {
    assert.equal(classifyUv(6.5).label, "High");
    assert.equal(classifyUv(8.5).label, "Very High");
  });
});

describe("getAqiGuidance", () => {
  test("gives an action for every EPA tier", () => {
    const tiers = [25, 75, 130, 175, 250, 400];
    for (const aqi of tiers) {
      const guidance = getAqiGuidance(aqi);
      assert.ok(guidance.length > 0, `AQI ${aqi} must carry guidance`);
      assert.match(guidance, /\.$/, `AQI ${aqi} guidance should be a sentence`);
    }
  });

  test("says nothing when the reading is missing", () => {
    // An absent AQI is not a safe AQI. Rendering "no precautions needed" for
    // data we never received is the fake certainty this codebase exists to
    // avoid — so the caller gets an empty string and renders nothing.
    assert.equal(getAqiGuidance(null), "");
    assert.equal(getAqiGuidance(undefined), "");
  });

  test("escalates: clean air needs no precautions, hazardous air means stay in", () => {
    assert.match(getAqiGuidance(25), /no precautions/i);
    assert.match(getAqiGuidance(130), /sensitive groups/i);
    assert.match(getAqiGuidance(400), /stay indoors/i);
  });

  test("names sensitive groups on the tier whose label abbreviates them", () => {
    // getAqiStatus shortens EPA's "Unhealthy for Sensitive Groups" to
    // "Sensitive" so it fits the tile. The guidance has to spell out who that
    // means, or the label is jargon.
    assert.equal(getAqiStatus(130).label, "Sensitive");
    assert.match(getAqiGuidance(130), /asthma/i);
  });
});
