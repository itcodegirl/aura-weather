import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getAqiStatus, getUvStatus } from "../domain/exposure.js";

/*
 * getAqiStatus and getUvStatus return a tone; AtmosphereBento.css turns that
 * tone into the arc's stroke. Nothing in JavaScript can see the second half,
 * and the failure mode is silent in the worst way: a tone with no rule leaves
 * the fill path with no `stroke` at all, which SVG resolves to `none`. The arc
 * simply does not draw, and a missing gauge fill reads as "low", not "broken".
 *
 * This is also what keeps the AQI arc from re-forking the --risk-* ramp. The
 * hexes it used to return restated five of the ramp's six stops byte-for-byte,
 * and the one time that pattern went unchecked (classifyStormRisk) the copy
 * drifted. Pinning the token names here means a ramp edit moves the arc with
 * it, and a hex pasted back in fails.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const readCss = (rel) => readFileSync(`${REPO_ROOT}/${rel}`, "utf8");

const BENTO_CSS = readCss("src/components/AtmosphereBento.css");
const APP_CSS = readCss("src/App.css");

// `.atm-arc-fill[data-scale="aqi"][data-tone="good"] { stroke: <value>; }`
function readArcStrokes(css) {
  const rule =
    /\.atm-arc-fill\[data-scale="([a-z]+)"\]\[data-tone="([a-z-]+)"\]\s*\{[^}]*?stroke:\s*([^;}]+)/g;
  const found = new Map();
  for (const [, scale, tone, value] of css.matchAll(rule)) {
    found.set(`${scale}:${tone}`, value.trim());
  }
  return found;
}

function readRamp(css) {
  const ramp = new Map();
  for (const [, stop, value] of css.matchAll(
    /--risk-([a-z]+):\s*(#[0-9a-fA-F]{6})/g
  )) {
    ramp.set(`--risk-${stop}`, value.toLowerCase());
  }
  return ramp;
}

// Resolves `var(--risk-low)` against the ramp; passes a literal through.
function resolve(value, ramp) {
  const varRef = value.match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (!varRef) return value.toLowerCase();
  const resolved = ramp.get(varRef[1]);
  assert.ok(resolved, `${value} names a token App.css does not define`);
  return resolved;
}

const strokes = readArcStrokes(BENTO_CSS);
const ramp = readRamp(APP_CSS);

const AQI_SAMPLES = [25, 75, 125, 175, 250, 400];
const UV_SAMPLES = [1, 4, 6.5, 9, 11];

describe("atmosphere arc tones resolve to colours", () => {
  test("every tone the domain can return has a stroke rule", () => {
    for (const aqi of AQI_SAMPLES) {
      const key = `aqi:${getAqiStatus(aqi).tone}`;
      assert.ok(
        strokes.has(key),
        `AQI ${aqi} returns tone "${getAqiStatus(aqi).tone}" with no CSS rule — the arc would not stroke at all`
      );
    }
    for (const uv of UV_SAMPLES) {
      const key = `uv:${getUvStatus(uv).tone}`;
      assert.ok(
        strokes.has(key),
        `UV ${uv} returns tone "${getUvStatus(uv).tone}" with no CSS rule — the arc would not stroke at all`
      );
    }
  });

  test("the AQI arc is driven by the --risk-* ramp, not a copy of it", () => {
    // The five tiers that were byte-identical to ramp stops before the hexes
    // moved out of the domain layer. Named tokens, so a ramp edit moves the
    // arc with it and a pasted hex fails here.
    assert.deepEqual(
      [
        strokes.get("aqi:good"),
        strokes.get("aqi:moderate"),
        strokes.get("aqi:sensitive"),
        strokes.get("aqi:unhealthy"),
        strokes.get("aqi:very-unhealthy"),
      ],
      [
        "var(--risk-low)",
        "var(--risk-elevated)",
        "var(--risk-high)",
        "var(--risk-severe)",
        "var(--risk-extreme)",
      ]
    );
    // Hazardous is one tier past the ramp's top, so it stays a literal.
    assert.equal(strokes.get("aqi:hazardous"), "#7f1d1d");
  });

  test("each scale still renders a distinct colour per tier", () => {
    // This is the promise the old "returns distinct colors" tests made while
    // the hexes lived in the domain layer: a sighted reader can tell severity
    // from the fill alone. It only holds end to end if the CSS agrees.
    const aqiColours = new Set(
      AQI_SAMPLES.map((aqi) =>
        resolve(strokes.get(`aqi:${getAqiStatus(aqi).tone}`), ramp)
      )
    );
    assert.equal(aqiColours.size, 6, "six distinct AQI tier colours");

    const uvColours = new Set(
      UV_SAMPLES.map((uv) =>
        resolve(strokes.get(`uv:${getUvStatus(uv).tone}`), ramp)
      )
    );
    assert.equal(uvColours.size, 5, "five distinct UV band colours");
  });

  test("no arc colour changed when the hexes moved out of the domain layer", () => {
    // The exact values getAqiStatus/getUvStatus returned before this change.
    // Recorded so the move is provably a relocation, not a re-palette.
    const before = {
      "aqi:good": "#22c55e",
      "aqi:moderate": "#eab308",
      "aqi:sensitive": "#f97316",
      "aqi:unhealthy": "#ef4444",
      "aqi:very-unhealthy": "#a855f7",
      "aqi:hazardous": "#7f1d1d",
      "uv:low": "#22c55e",
      "uv:moderate": "#eab308",
      "uv:high": "#f97316",
      "uv:very-high": "#f43f5e",
      "uv:extreme": "#7f1d1d",
    };
    for (const [key, expected] of Object.entries(before)) {
      assert.equal(
        resolve(strokes.get(key), ramp),
        expected,
        `${key} must still render ${expected}`
      );
    }
  });
});
