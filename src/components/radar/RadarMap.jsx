import { memo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Pane, Polygon, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { radarTileUrlTemplate, RADAR_MAX_ZOOM } from "../../domain/radar.js";
import { BASE_ATTRIBUTION, BASE_MAX_ZOOM, BASE_TILE_URL } from "../../domain/basemap.js";

const RADAR_ATTRIBUTION =
  'Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>';

const DEFAULT_ZOOM = 7;
const MIN_ZOOM = 3;
const MAX_ZOOM = 9;
const RADAR_OPACITY = 0.8;

const HALO_OPTIONS = {
  color: "#6fb7f2",
  weight: 0,
  fillColor: "#6fb7f2",
  fillOpacity: 0.18,
};
const DOT_OPTIONS = {
  color: "#f8fafc",
  weight: 2,
  fillColor: "#6fb7f2",
  fillOpacity: 1,
};

/*
 * The alert outline. Amber against a light basemap, and deliberately
 * low-fill: this is a boundary, and a solid wash would hide the very radar
 * echoes the reader is comparing it against.
 */
const ALERT_SHAPE_OPTIONS = {
  color: "#f2a33c",
  weight: 2,
  fillColor: "#f2a33c",
  fillOpacity: 0.12,
};

/*
 * A direct prop, not a `pathOptions` key: react-leaflet hands `pathOptions`
 * to `setStyle`, which does not touch the element's class list, while
 * Leaflet reads `options.className` once at path creation. Inside
 * `pathOptions` this silently does nothing.
 */
const ALERT_SHAPE_CLASS = "radar-alert-shape";

/*
 * Leaflet stacks vector layers by insertion order within one pane, and
 * react-leaflet adds each layer in a passive effect — so a polygon that
 * mounts after the location marker paints on top of it, which is the one
 * thing WP-2 says must never happen. A named pane takes the ordering out of
 * mount order entirely: 350 sits above the radar tiles (tilePane, 200) and
 * below the marker (overlayPane, 400), whenever either arrives.
 */
const ALERT_PANE = "alert-shapes";
const ALERT_PANE_STYLE = { zIndex: 350 };

/** Stable empty default, so an alert-less map never re-renders on identity. */
const NO_SHAPES = [];

// Pan the existing map when the active location changes, instead of
// re-mounting <MapContainer> (which would trip Leaflet's "Map container
// is already initialized" under React StrictMode's double-invoke).
function RecenterMap({ lat, lon }) {
  const map = useMap();
  const lastKeyRef = useRef(null);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const key = `${lat},${lon}`;
    if (lastKeyRef.current === key) {
      return;
    }
    lastKeyRef.current = key;
    // The app's global reduce-motion block neutralises CSS animation, but a
    // Leaflet pan is scripted, so it escaped that net — the one motion in
    // the app not honouring the preference. Jump straight to the new centre
    // when the user has asked for reduced motion.
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.setView([lat, lon], DEFAULT_ZOOM, { animate: !reduceMotion });
  }, [lat, lon, map]);

  return null;
}

// Touch standard: on touch devices, one finger scrolls the page (so the
// map never traps the scroll) and two fingers pan/pinch the map. On a
// mouse (fine pointer) we leave Leaflet's normal one-pointer drag alone.
function CooperativeGestures() {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      return undefined;
    }
    const el = map.getContainer();
    map.dragging.disable();
    const onTouchStart = (event) => {
      if (event.touches && event.touches.length >= 2) {
        map.dragging.enable();
      }
    };
    const onTouchEnd = (event) => {
      if (!event.touches || event.touches.length < 2) {
        map.dragging.disable();
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [map]);

  return null;
}

function RadarMap({ host, frames, activeIndex, center, retina = false, alertShapes = NO_SHAPES }) {
  const [lat, lon] = center;

  return (
    <MapContainer
      className="radar-map"
      center={center}
      zoom={DEFAULT_ZOOM}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      scrollWheelZoom
      worldCopyJump
      attributionControl
    >
      {/*
       * The basemap. Its host, attribution and zoom ceiling live in
       * domain/basemap.js — see that file for why this is OpenStreetMap and
       * not CARTO, which began serving an "API KEY REQUIRED" watermark as a
       * valid 200 PNG. No `subdomains`: the OSMF policy asks clients not to
       * rotate across a/b/c hosts.
       *
       * `className` puts the CSS wash on THIS layer alone — the radar frames
       * share the same tile pane and must keep their colour.
       */}
      <TileLayer
        url={BASE_TILE_URL}
        attribution={BASE_ATTRIBUTION}
        className="radar-basemap"
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxNativeZoom={BASE_MAX_ZOOM}
      />

      {/*
       * Every frame layer stays mounted so its tiles preload into the
       * Leaflet cache; only the active frame is shown (opacity 0.8) while
       * the rest sit at opacity 0. Scrubbing/playing then just toggles
       * opacity on already-loaded tiles — no fetch, no flicker.
       *
       * Inactive (invisible) layers set updateWhenIdle so they only reload
       * tiles once the map settles, instead of refetching ~14 hidden tile
       * pyramids on every pan/zoom frame; the active layer keeps
       * updateWhenIdle=false so the visible frame stays immediately sharp.
       */}
      {frames.map((frame, index) => {
        const url = radarTileUrlTemplate(host, frame, { retina });
        if (!url) {
          return null;
        }
        const isActive = index === activeIndex;
        return (
          <TileLayer
            key={frame.path}
            url={url}
            attribution={RADAR_ATTRIBUTION}
            opacity={isActive ? RADAR_OPACITY : 0}
            zIndex={isActive ? 12 : 10}
            maxNativeZoom={RADAR_MAX_ZOOM}
            updateWhenIdle={!isActive}
          />
        );
      })}

      {alertShapes.length > 0 ? (
        <Pane name={ALERT_PANE} style={ALERT_PANE_STYLE}>
          {alertShapes.map((shape) => (
            <Polygon
              key={shape.id}
              positions={shape.positions}
              pathOptions={ALERT_SHAPE_OPTIONS}
              className={ALERT_SHAPE_CLASS}
            />
          ))}
        </Pane>
      ) : null}

      <CircleMarker center={center} radius={13} pathOptions={HALO_OPTIONS} />
      <CircleMarker center={center} radius={5} pathOptions={DOT_OPTIONS} />

      <CooperativeGestures />
      <RecenterMap lat={lat} lon={lon} />
    </MapContainer>
  );
}

export default memo(RadarMap);
