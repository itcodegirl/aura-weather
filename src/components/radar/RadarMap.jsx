import { memo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { radarTileUrlTemplate, RADAR_MAX_ZOOM } from "../../api/rainviewer.js";

// Carto Positron raster — key-less, clean light basemap that reads as a
// calm inset beneath Aura's dark glass shell. `{r}` lets Leaflet request
// @2x tiles on high-DPI screens automatically.
const BASE_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const BASE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
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
    map.setView([lat, lon], DEFAULT_ZOOM, { animate: true });
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

function RadarMap({ host, frames, activeIndex, center, retina = false }) {
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
      <TileLayer
        url={BASE_TILE_URL}
        attribution={BASE_ATTRIBUTION}
        subdomains="abcd"
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
      />

      {/*
       * Every frame layer stays mounted so its tiles preload into the
       * Leaflet cache; only the active frame is shown (opacity 0.8) while
       * the rest sit at opacity 0. Scrubbing/playing then just toggles
       * opacity on already-loaded tiles — no fetch, no flicker.
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
            updateWhenIdle={false}
          />
        );
      })}

      <CircleMarker center={center} radius={13} pathOptions={HALO_OPTIONS} />
      <CircleMarker center={center} radius={5} pathOptions={DOT_OPTIONS} />

      <CooperativeGestures />
      <RecenterMap lat={lat} lon={lon} />
    </MapContainer>
  );
}

export default memo(RadarMap);
