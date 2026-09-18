/**
 * Where a severe-weather alert actually is — the one question of the five
 * the card could not answer at all.
 *
 * ## Two orders, one map
 *
 * GeoJSON writes a position as `[longitude, latitude]`. Leaflet takes
 * `[latitude, longitude]`. Passing one where the other is expected does not
 * throw: Leaflet rejects only NaN, so a Nebraska warning at
 * `[-102.6, 41.52]` renders — as a shape at latitude -102.6, clamped
 * somewhere off the south pole. It fails visibly and silently at the same
 * time, which is why the swap lives here, in one pure function, with the
 * order pinned by tests, rather than inline at a call site.
 *
 * ## What is drawable
 *
 * A single `Polygon` with one outer ring. Measured against the live feed on
 * 2026-09-18: every geometry the provider sent was exactly that, at most 20
 * vertices, median 9 — so no simplification, tiling or clustering is
 * warranted, and `MultiPolygon` is deliberately not drawn rather than
 * half-drawn.
 *
 * Two alerts in the recorded sample carry a Polygon; four carry
 * `geometry: null`. That is not a provider defect — a zone-issued product
 * (beach hazards, air quality) is scoped to whole counties and has no
 * outline to draw. Those get the caption, not a shape.
 *
 * ## What "unusable" means
 *
 * A ring with one bad vertex is rejected whole. A partial polygon is a claim
 * about an area, and half of an alert boundary is a different area from the
 * alert's. Same reason `toFiniteNumber` refuses to read null as zero.
 *
 * An alert whose `geometry` KEY IS ABSENT is a third case, distinct from
 * both: it was normalised before this field existed and was restored from
 * the snapshot cache. Nothing is known about its shape, so it is neither
 * drawn nor counted as undrawable — silence, not a guess in either
 * direction.
 */

import { toFiniteNumber } from "../utils/numbers.js";

/** GeoJSON requires four positions for a closed linear ring. */
const MIN_RING_POSITIONS = 4;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const UNDRAWN_NOTE_SINGULAR = "County-level alert — not drawn on map";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates one GeoJSON position and returns it as `[latitude, longitude]`.
 *
 * The swap is this line and only this line. `position[0]` is longitude and
 * `position[1]` is latitude, per RFC 7946 §3.1.1; a third element (altitude)
 * is allowed by the spec and ignored here.
 *
 * @param {unknown} position
 * @returns {[number, number]|null} Leaflet-ordered pair, or null if unusable.
 */
function toLeafletPosition(position) {
  if (!Array.isArray(position) || position.length < 2) {
    return null;
  }

  const longitude = toFiniteNumber(position[0]);
  const latitude = toFiniteNumber(position[1]);

  if (longitude === null || latitude === null) {
    return null;
  }
  if (Math.abs(latitude) > MAX_LATITUDE || Math.abs(longitude) > MAX_LONGITUDE) {
    return null;
  }

  return [latitude, longitude];
}

/**
 * Validates provider geometry, keeping the provider's own shape and order.
 *
 * Called by the normaliser so the model records what the feed actually sent —
 * GeoJSON, in GeoJSON order — rather than a map library's idea of it. The
 * conversion to Leaflet order happens at draw time, in `toLeafletPositions`.
 *
 * @param {unknown} geometry A GeoJSON geometry object, or anything at all.
 * @returns {{type: "Polygon", coordinates: number[][][]}|null}
 *   The geometry unchanged when it is a drawable single-ring Polygon,
 *   otherwise null. `MultiPolygon`, `Point`, `GeometryCollection` and
 *   malformed input all return null: not drawn, and honestly so.
 */
export function normaliseAlertGeometry(geometry) {
  if (!isPlainObject(geometry) || geometry.type !== "Polygon") {
    return null;
  }

  const rings = geometry.coordinates;
  if (!Array.isArray(rings) || rings.length === 0) {
    return null;
  }

  /*
   * Only the outer ring is read. A Polygon may carry holes; none appeared in
   * the sample, and drawing an outer ring while silently discarding a hole
   * would overstate the alerted area. If one ever arrives, it is rejected
   * whole rather than drawn wrong.
   */
  if (rings.length > 1) {
    return null;
  }

  return toLeafletPositions(geometry) === null
    ? null
    : /** @type {{type: "Polygon", coordinates: number[][][]}} */ (geometry);
}

/**
 * Converts a validated Polygon into Leaflet `[lat, lon]` positions.
 *
 * @param {unknown} geometry
 * @returns {Array<[number, number]>|null} The outer ring, Leaflet-ordered, or
 *   null when the geometry is absent, not a single-ring Polygon, or carries
 *   any unusable vertex. Never a partial ring.
 */
export function toLeafletPositions(geometry) {
  if (!isPlainObject(geometry) || geometry.type !== "Polygon") {
    return null;
  }

  const rings = geometry.coordinates;
  if (!Array.isArray(rings) || rings.length !== 1) {
    return null;
  }

  const ring = rings[0];
  if (!Array.isArray(ring) || ring.length < MIN_RING_POSITIONS) {
    return null;
  }

  const positions = [];
  for (const position of ring) {
    const converted = toLeafletPosition(position);
    if (converted === null) {
      // One bad vertex voids the ring. Never a partial shape.
      return null;
    }
    positions.push(converted);
  }

  return positions;
}

/**
 * Splits an alert list into what the map can draw and what it cannot.
 *
 * @param {Array<{id?: string, geometry?: unknown}>} alerts Alerts the card is
 *   already showing. The caller filters them first, so the map and the card
 *   never describe different sets.
 * @returns {{shapes: Array<{id: string, positions: Array<[number, number]>}>,
 *            undrawnCount: number}}
 *   `undrawnCount` counts only alerts KNOWN to have no drawable outline. An
 *   alert carrying no `geometry` key at all — restored from a snapshot
 *   written before the field existed — is counted in neither, because
 *   "county-level" would be a claim about it that nothing supports.
 */
export function summariseAlertGeometry(alerts) {
  const shapes = [];
  let undrawnCount = 0;

  if (!Array.isArray(alerts)) {
    return { shapes, undrawnCount };
  }

  alerts.forEach((alert, index) => {
    if (!isPlainObject(alert) || !("geometry" in alert)) {
      return;
    }

    const positions = toLeafletPositions(alert.geometry);
    if (positions === null) {
      undrawnCount += 1;
      return;
    }

    shapes.push({
      id: typeof alert.id === "string" && alert.id !== "" ? alert.id : `alert-shape-${index}`,
      positions,
    });
  });

  return { shapes, undrawnCount };
}

/**
 * The caption for alerts the map cannot draw.
 *
 * @param {{shapes: Array<unknown>, undrawnCount: number}} summary
 * @returns {string|null} Null when there is nothing to explain — every alert
 *   drew, or there were none. A count appears whenever it carries
 *   information: more than one undrawn alert, or a mix of drawn and undrawn,
 *   where "an alert is missing" would otherwise be ambiguous.
 */
export function undrawnAlertsNote(summary) {
  const undrawnCount = summary?.undrawnCount ?? 0;
  if (undrawnCount <= 0) {
    return null;
  }

  const drawnCount = Array.isArray(summary?.shapes) ? summary.shapes.length : 0;
  if (undrawnCount === 1 && drawnCount === 0) {
    return UNDRAWN_NOTE_SINGULAR;
  }

  const noun = undrawnCount === 1 ? "alert" : "alerts";
  return `${undrawnCount} county-level ${noun} — not drawn on map`;
}
