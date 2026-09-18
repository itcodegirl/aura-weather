import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BASE_ATTRIBUTION, BASE_MAX_ZOOM, BASE_TILE_URL } from "./basemap.js";

describe("the radar basemap", () => {
  /*
   * The regression this file exists for. CARTO began gating its raster
   * basemaps behind an API key, and the failure is invisible to any check
   * that looks at status codes: the tile returns 200 with a valid PNG whose
   * content is the words "API KEY REQUIRED" repeated across it. Nothing can
   * assert on the pixels from here, so the guard is on the host.
   */
  test("does not request a host that gates tiles behind an API key", () => {
    assert.doesNotMatch(BASE_TILE_URL, /cartocdn\.com/);
    assert.doesNotMatch(BASE_TILE_URL, /apikey|api_key|access[-_]?token/i);
  });

  test("is served over https from OpenStreetMap", () => {
    assert.match(BASE_TILE_URL, /^https:\/\/tile\.openstreetmap\.org\//);
  });

  test("carries the z/x/y placeholders Leaflet substitutes", () => {
    for (const token of ["{z}", "{x}", "{y}"]) {
      assert.ok(BASE_TILE_URL.includes(token), `missing ${token}`);
    }
  });

  test("asks for neither a subdomain rotation nor a retina tile", () => {
    // The OSMF policy asks clients not to spread load across a/b/c hosts,
    // and the standard layer has no @2x tile — requesting one 404s, which
    // Leaflet renders as a hole in the map rather than an error.
    assert.doesNotMatch(BASE_TILE_URL, /\{s\}/);
    assert.doesNotMatch(BASE_TILE_URL, /\{r\}/);
  });

  test("attributes OpenStreetMap with a link to the licence", () => {
    // Required by the OSMF tile policy, and it must be visible on the map.
    assert.match(BASE_ATTRIBUTION, /OpenStreetMap/);
    assert.match(BASE_ATTRIBUTION, /openstreetmap\.org\/copyright/);
    assert.match(BASE_ATTRIBUTION, /contributors/);
  });

  test("no longer credits a provider it does not use", () => {
    assert.doesNotMatch(BASE_ATTRIBUTION, /CARTO/i);
  });

  test("declares the zoom ceiling the layer actually serves", () => {
    assert.equal(BASE_MAX_ZOOM, 19);
  });
});

describe("the basemap is read from one place", () => {
  const radarMap = readFileSync(new URL("../components/radar/RadarMap.jsx", import.meta.url), "utf8");

  test("RadarMap imports the tile template instead of spelling one out", () => {
    assert.match(radarMap, /from "\.\.\/\.\.\/domain\/basemap\.js"/);
    assert.doesNotMatch(radarMap, /https:\/\/\{s\}\.basemaps\.cartocdn\.com/);
  });

  test("no component hard-codes a tile host", () => {
    // If a second basemap URL ever appears in the component, the next outage
    // has two places to fix and one of them will be missed.
    assert.doesNotMatch(radarMap, /https:\/\/[^"']*\{z\}[^"']*\{x\}/);
  });
});
