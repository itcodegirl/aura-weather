/**
 * Radar vocabulary: what a frame is, what states the panel can be in, and how
 * a frame's tile URL is spelled. All pure — no fetching, no React.
 *
 * These used to live in `api/rainviewer.js`, which forced the three radar
 * components to import from the api layer directly, skipping past hooks and
 * contradicting the dependency direction the README claims. Nothing here
 * touches the network: `radarTileUrlTemplate` is string construction, and the
 * enums are names. The fetching, parsing and override handling stay in the api
 * layer, which now imports its vocabulary from here (a downward import).
 */

// Free / personal tier render options: Universal Blue (color 4), smoothing on,
// snow on. Higher zoom, extra colour schemes, and nowcast frames are gated on
// paid tiers.
export const RADAR_COLOR_SCHEME = 4; // Universal Blue
export const RADAR_SMOOTH = 1;
export const RADAR_SNOW = 1;
export const RADAR_MAX_ZOOM = 7; // free-tier radar zoom ceiling

export const RADAR_FRAME_KIND = Object.freeze({
  PAST: "past",
  NOWCAST: "nowcast",
});

export const RADAR_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  ERROR: "error",
});

/**
 * Builds the Leaflet tile-URL template for one radar frame. The tile
 * coordinate scheme is identical for the 256 and 512 pixel variants —
 * 512 simply returns a double-resolution image for the same {z}/{x}/{y}
 * — so callers keep Leaflet's `tileSize` at 256 (aligned with the base
 * map) and pass `retina: true` only to request the sharper image.
 */
export function radarTileUrlTemplate(host, frame, { retina = false } = {}) {
  if (!host || !frame?.path) {
    return null;
  }
  const pixelSize = retina ? 512 : 256;
  return `${host}${frame.path}/${pixelSize}/{z}/{x}/{y}/${RADAR_COLOR_SCHEME}/${RADAR_SMOOTH}_${RADAR_SNOW}.png`;
}
