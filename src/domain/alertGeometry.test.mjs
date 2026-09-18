import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  normaliseAlertGeometry,
  summariseAlertGeometry,
  toLeafletPositions,
  undrawnAlertsNote,
} from "./alertGeometry.js";

const recorded = JSON.parse(
  readFileSync(
    new URL("../api/__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
    "utf8"
  )
);

const featureFor = (event) =>
  recorded.features.find((feature) => feature.properties.event === event);

/** A valid square somewhere in Illinois, in GeoJSON order. */
const polygon = (ring) => ({ type: "Polygon", coordinates: [ring] });
const SQUARE = [
  [-87.9, 41.6],
  [-87.7, 41.6],
  [-87.7, 41.8],
  [-87.9, 41.8],
  [-87.9, 41.6],
];

describe("toLeafletPositions — the coordinate order", () => {
  /*
   * The whole ticket turns on this. GeoJSON is [lon, lat]; Leaflet is
   * [lat, lon]. The live values make the mistake detectable: every CONUS
   * longitude is outside the legal latitude range, so a swapped pair is not
   * merely in the wrong place, it is not a coordinate at all.
   */
  test("swaps a real provider ring, longitude-first in, latitude-first out", () => {
    const geometry = featureFor("Severe Thunderstorm Warning").geometry;
    assert.equal(geometry.type, "Polygon");

    const ring = geometry.coordinates[0];
    const positions = toLeafletPositions(geometry);

    assert.equal(positions.length, ring.length);
    positions.forEach(([lat, lon], index) => {
      const [sourceLon, sourceLat] = ring[index];
      assert.equal(lat, sourceLat, `vertex ${index} latitude`);
      assert.equal(lon, sourceLon, `vertex ${index} longitude`);
    });
  });

  test("the first vertex of that ring, spelled out", () => {
    // [-102.6, 41.52] is western Nebraska. Read the other way round it is
    // latitude -102.6, which does not exist.
    const geometry = featureFor("Severe Thunderstorm Warning").geometry;
    assert.deepEqual(geometry.coordinates[0][0], [-102.6, 41.52]);
    assert.deepEqual(toLeafletPositions(geometry)[0], [41.52, -102.6]);
  });

  test("every emitted latitude is a legal latitude, for both recorded polygons", () => {
    for (const event of ["Severe Thunderstorm Warning", "Special Weather Statement"]) {
      const positions = toLeafletPositions(featureFor(event).geometry);
      assert.ok(positions, `${event} must be drawable`);
      for (const [lat, lon] of positions) {
        assert.ok(Math.abs(lat) <= 90, `${event}: latitude ${lat} out of range`);
        assert.ok(Math.abs(lon) <= 180, `${event}: longitude ${lon} out of range`);
      }
    }
  });

  test("the second recorded polygon converts too, and keeps its vertex count", () => {
    const geometry = featureFor("Special Weather Statement").geometry;
    const positions = toLeafletPositions(geometry);
    assert.equal(positions.length, geometry.coordinates[0].length);
    assert.deepEqual(positions[0], [43.65, -112.58]);
  });
});

describe("toLeafletPositions — what is not drawable", () => {
  test("a MultiPolygon is not drawn at all, rather than drawn in part", () => {
    assert.equal(
      toLeafletPositions({ type: "MultiPolygon", coordinates: [[SQUARE]] }),
      null
    );
  });

  test("other geometry types are not drawn", () => {
    assert.equal(toLeafletPositions({ type: "Point", coordinates: [-87.8, 41.7] }), null);
    assert.equal(toLeafletPositions({ type: "LineString", coordinates: SQUARE }), null);
    assert.equal(toLeafletPositions({ type: "GeometryCollection", geometries: [] }), null);
  });

  test("absent geometry is not drawn — the zone-issued case, four of six recorded features", () => {
    const zoneIssued = recorded.features.filter((feature) => feature.geometry === null);
    assert.ok(zoneIssued.length >= 3, "fixture must carry the geometry-less case");
    for (const feature of zoneIssued) {
      assert.equal(toLeafletPositions(feature.geometry), null);
    }
  });

  test("one unusable vertex voids the whole ring, never a partial shape", () => {
    for (const bad of [null, undefined, "41.6", {}, [], [Number.NaN, 41.6], [-87.9], true]) {
      const ring = [...SQUARE];
      ring[2] = bad;
      assert.equal(
        toLeafletPositions(polygon(ring)),
        null,
        `vertex ${JSON.stringify(bad)} must void the ring`
      );
    }
  });

  test("a coordinate outside its own range is unusable", () => {
    assert.equal(toLeafletPositions(polygon([...SQUARE.slice(0, 4), [-87.9, 91]])), null);
    assert.equal(toLeafletPositions(polygon([...SQUARE.slice(0, 4), [181, 41.6]])), null);
    // The swapped-by-the-provider case: latitude -102.6 does not exist.
    assert.equal(
      toLeafletPositions(polygon([[41.52, -102.6], [41.62, -102.64], [41.69, -102.64], [41.52, -102.6]])),
      null
    );
  });

  test("a ring with fewer than four positions cannot close", () => {
    assert.equal(toLeafletPositions(polygon(SQUARE.slice(0, 3))), null);
    assert.equal(toLeafletPositions(polygon([])), null);
  });

  test("a polygon with a hole is rejected whole — an outer ring alone overstates the area", () => {
    assert.equal(
      toLeafletPositions({ type: "Polygon", coordinates: [SQUARE, SQUARE] }),
      null
    );
  });

  test("garbage never throws and never draws", () => {
    for (const value of [null, undefined, "", "Polygon", 42, [], [SQUARE], true, { type: "Polygon" }]) {
      assert.equal(toLeafletPositions(value), null, JSON.stringify(value) ?? String(value));
    }
  });

  test("a third ordinate (altitude) is allowed and ignored, per RFC 7946", () => {
    const withAltitude = SQUARE.map(([lon, lat]) => [lon, lat, 300]);
    assert.deepEqual(toLeafletPositions(polygon(withAltitude))[0], [41.6, -87.9]);
  });
});

describe("normaliseAlertGeometry — what the model records", () => {
  test("keeps a drawable Polygon exactly as the provider sent it, in GeoJSON order", () => {
    const geometry = featureFor("Severe Thunderstorm Warning").geometry;
    const normalised = normaliseAlertGeometry(geometry);

    assert.equal(normalised, geometry, "the provider's own object is kept");
    assert.deepEqual(normalised.coordinates[0][0], [-102.6, 41.52], "still [lon, lat]");
  });

  test("returns null for everything the map cannot draw", () => {
    assert.equal(normaliseAlertGeometry(null), null);
    assert.equal(normaliseAlertGeometry(undefined), null);
    assert.equal(normaliseAlertGeometry({ type: "MultiPolygon", coordinates: [[SQUARE]] }), null);
    assert.equal(normaliseAlertGeometry({ type: "Polygon", coordinates: [SQUARE, SQUARE] }), null);
    assert.equal(normaliseAlertGeometry(polygon(SQUARE.slice(0, 2))), null);
    assert.equal(normaliseAlertGeometry("Polygon"), null);
  });

  test("a Polygon carrying one bad vertex is recorded as no geometry, not as a partial one", () => {
    const ring = [...SQUARE];
    ring[1] = [null, 41.6];
    assert.equal(normaliseAlertGeometry(polygon(ring)), null);
  });
});

describe("summariseAlertGeometry — what draws and what is counted", () => {
  const drawable = (id) => ({ id, geometry: polygon(SQUARE) });
  const zoneIssued = (id) => ({ id, geometry: null });

  test("splits a mixed list and keeps each shape's id", () => {
    const summary = summariseAlertGeometry([drawable("a"), zoneIssued("b"), drawable("c")]);

    assert.equal(summary.shapes.length, 2);
    assert.deepEqual(summary.shapes.map((shape) => shape.id), ["a", "c"]);
    assert.deepEqual(summary.shapes[0].positions[0], [41.6, -87.9]);
    assert.equal(summary.undrawnCount, 1);
  });

  test("an alert with no geometry KEY is neither drawn nor counted", () => {
    // The shape a snapshot written before this field existed restores. Its
    // outline was never recorded, so calling it county-level would be a
    // claim about it that nothing supports.
    const restored = { id: "old" };
    assert.equal("geometry" in restored, false);

    const summary = summariseAlertGeometry([restored, drawable("a")]);
    assert.equal(summary.shapes.length, 1);
    assert.equal(summary.undrawnCount, 0);
  });

  test("falls back to a positional id rather than dropping a drawable shape", () => {
    const summary = summariseAlertGeometry([{ geometry: polygon(SQUARE) }]);
    assert.equal(summary.shapes.length, 1);
    assert.equal(summary.shapes[0].id, "alert-shape-0");
  });

  test("a malformed geometry counts as undrawable, not as a crash", () => {
    const summary = summariseAlertGeometry([{ id: "x", geometry: { type: "Polygon", coordinates: "nope" } }]);
    assert.deepEqual(summary, { shapes: [], undrawnCount: 1 });
  });

  test("empty and non-array input yields nothing to draw and nothing to explain", () => {
    for (const value of [[], null, undefined, "alerts", 3, {}]) {
      assert.deepEqual(summariseAlertGeometry(value), { shapes: [], undrawnCount: 0 });
    }
  });

  test("runs over the recorded feed's own shape", () => {
    // Mirrors what the normaliser produces: geometry validated, key always present.
    const alerts = recorded.features.map((feature, index) => ({
      id: `recorded-${index}`,
      geometry: normaliseAlertGeometry(feature.geometry),
    }));

    const summary = summariseAlertGeometry(alerts);
    assert.equal(summary.shapes.length, 2, "two polygons in the recorded sample");
    assert.equal(summary.undrawnCount, 3, "three zone-issued alerts in the same sample");
  });
});

describe("undrawnAlertsNote — the caption", () => {
  const summary = (drawn, undrawnCount) => ({
    shapes: Array.from({ length: drawn }, (_, i) => ({ id: `s${i}`, positions: [] })),
    undrawnCount,
  });

  test("says nothing when every alert drew", () => {
    assert.equal(undrawnAlertsNote(summary(2, 0)), null);
  });

  test("says nothing when there are no alerts at all", () => {
    assert.equal(undrawnAlertsNote(summary(0, 0)), null);
    assert.equal(undrawnAlertsNote({ shapes: [], undrawnCount: 0 }), null);
  });

  test("a single undrawn alert, alone on the map, needs no count", () => {
    assert.equal(undrawnAlertsNote(summary(0, 1)), "County-level alert — not drawn on map");
  });

  test("a count appears when one alert drew and another did not", () => {
    assert.equal(undrawnAlertsNote(summary(1, 1)), "1 county-level alert — not drawn on map");
  });

  test("a count appears whenever more than one alert is undrawn", () => {
    assert.equal(undrawnAlertsNote(summary(0, 3)), "3 county-level alerts — not drawn on map");
    assert.equal(undrawnAlertsNote(summary(2, 2)), "2 county-level alerts — not drawn on map");
  });

  test("the caption never claims a number it does not have", () => {
    for (const value of [null, undefined, {}, { undrawnCount: 0 }, { undrawnCount: -1 }]) {
      assert.equal(undrawnAlertsNote(value), null);
    }
  });
});
