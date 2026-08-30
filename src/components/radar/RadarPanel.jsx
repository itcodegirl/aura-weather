import { memo, useId, useMemo, useSyncExternalStore } from "react";
import { Radar, RefreshCw, CloudOff, MapPinOff } from "lucide-react";
import { InfoDrawer } from "../ui";
import { useRadarFrames } from "../../hooks/useRadarFrames.js";
import { useRadarAnimation } from "../../hooks/useRadarAnimation.js";
import { useTimeNow } from "../../hooks/useTimeNow.js";
import { RADAR_FRAME_KIND, RADAR_STATUS } from "../../domain/radar.js";
import { parseCoordinates } from "../../utils/weatherUnits.js";
import RadarMap from "./RadarMap.jsx";
import RadarTimeline from "./RadarTimeline.jsx";
import RadarLegend from "./RadarLegend.jsx";
import "./RadarPanel.css";

// Whether to request RainViewer's 512px (retina) tiles. Expressed as a
// media query rather than a bare `window.devicePixelRatio` read so it is
// *subscribable*: the ratio changes with browser zoom and when a window
// moves between displays, and a render-body read of it is both impure and
// frozen at first paint. `(min-resolution: 2dppx)` is the query form of
// `devicePixelRatio >= 2`; the -webkit- alias covers Safari before 16.
const RETINA_QUERY =
  "(min-resolution: 2dppx), (-webkit-min-device-pixel-ratio: 2)";

function subscribeToRetina(callback) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mediaQuery = window.matchMedia(RETINA_QUERY);
  const listener = () => callback();
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }
  // Older Safari fallback.
  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

function getRetinaSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof window.matchMedia !== "function") {
    // No media-query support: the ratio is the only signal available.
    return (window.devicePixelRatio || 1) >= 2;
  }
  try {
    return window.matchMedia(RETINA_QUERY).matches;
  } catch {
    return false;
  }
}

// SSR has no display to measure — assume the cheaper tiles.
function getRetinaServerSnapshot() {
  return false;
}

function useRetinaTiles() {
  return useSyncExternalStore(
    subscribeToRetina,
    getRetinaSnapshot,
    getRetinaServerSnapshot
  );
}

function RadarStateBlock({ icon, title, copy, action }) {
  return (
    <div className="radar-state" role="status">
      <span className="radar-state-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="radar-state-title">{title}</p>
      {copy && <p className="radar-state-copy">{copy}</p>}
      {action}
    </div>
  );
}

function RadarPanel({ location, timeZone, style, isRefreshing = false }) {
  const titleId = useId();
  const { frames, host, status, override, refetch } = useRadarFrames();
  const nowMs = useTimeNow();

  const center = useMemo(() => {
    // Route through the strict shared parser so a null/empty/invalid
    // coordinate is rejected instead of coercing to (0, 0) Null Island —
    // the radar's slice of the project-wide coordinate trust contract.
    const coordinates = parseCoordinates(location?.lat, location?.lon);
    return coordinates ? [coordinates.latitude, coordinates.longitude] : null;
  }, [location?.lat, location?.lon]);

  const boundaryIndex = useMemo(
    () => frames.findIndex((frame) => frame.kind === RADAR_FRAME_KIND.NOWCAST),
    [frames]
  );
  const hasForecast = boundaryIndex >= 0;

  // Start on the latest observed frame so the resting view shows "now".
  const preferredIndex = useMemo(() => {
    let lastPast = -1;
    for (let i = 0; i < frames.length; i += 1) {
      if (frames[i].kind === RADAR_FRAME_KIND.PAST) {
        lastPast = i;
      }
    }
    return lastPast >= 0 ? lastPast : Math.max(0, frames.length - 1);
  }, [frames]);

  const { activeIndex, isPlaying, toggle, next, prev, seek } = useRadarAnimation(
    frames.length,
    { preferredIndex }
  );

  const retina = useRetinaTiles();

  const locationName =
    typeof location?.name === "string" && location.name.trim()
      ? location.name.trim()
      : "your location";

  const explainer =
    status === RADAR_STATUS.READY
      ? hasForecast
        ? `Observed radar and short-range forecast near ${locationName}.`
        : `Observed precipitation radar near ${locationName}.`
      : `Live precipitation radar near ${locationName}.`;

  let body;
  if (override === "nocoverage") {
    body = (
      <RadarStateBlock
        icon={<MapPinOff size={22} aria-hidden="true" />}
        title="No radar coverage here"
        copy="RainViewer has no radar data for this location. Try a city in a covered region."
      />
    );
  } else if (!center) {
    body = (
      <RadarStateBlock
        icon={<MapPinOff size={22} aria-hidden="true" />}
        title="Waiting for a location"
        copy="Pick a place to see its precipitation radar."
      />
    );
  } else if (status === RADAR_STATUS.LOADING) {
    body = (
      <RadarStateBlock
        icon={<Radar size={22} aria-hidden="true" />}
        title="Tuning in the latest radar…"
      />
    );
  } else if (status === RADAR_STATUS.ERROR) {
    body = (
      <RadarStateBlock
        icon={<CloudOff size={22} aria-hidden="true" />}
        title="Radar unavailable right now"
        copy="RainViewer didn't respond. Your forecast above is unaffected."
        action={
          <button
            type="button"
            className="radar-retry"
            onClick={refetch}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Try again</span>
          </button>
        }
      />
    );
  } else if (status === RADAR_STATUS.EMPTY) {
    body = (
      <RadarStateBlock
        icon={<Radar size={22} aria-hidden="true" />}
        title="No radar frames right now"
        copy="RainViewer is reachable but has no recent frames to show."
        action={
          <button
            type="button"
            className="radar-retry"
            onClick={refetch}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Check again</span>
          </button>
        }
      />
    );
  } else {
    body = (
      <>
        <div className="radar-map-shell">
          <RadarMap
            host={host}
            frames={frames}
            activeIndex={activeIndex}
            center={center}
            retina={retina}
          />
        </div>
        <RadarTimeline
          frames={frames}
          activeIndex={activeIndex}
          isPlaying={isPlaying}
          hasForecast={hasForecast}
          boundaryIndex={boundaryIndex < 0 ? 0 : boundaryIndex}
          nowMs={nowMs}
          timeZone={timeZone}
          onToggle={toggle}
          onPrev={prev}
          onNext={next}
          onSeek={seek}
        />
        <RadarLegend />
      </>
    );
  }

  return (
    <section
      className="bento-radar radar-card glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="radar-header">
        <div className="radar-title-wrap">
          <div className="radar-title-row">
            <h3 id={titleId} className="radar-title">
              <Radar size={16} aria-hidden="true" />
              <span>Precipitation Radar</span>
            </h3>
            <InfoDrawer
              label="About the precipitation radar"
              title="How this radar works"
              className="radar-help-drawer"
            >
              RainViewer aggregates public radar sites into a global
              composite. Aura shows observed frames as observed and any
              forecast frames separately — it never blends the two or
              presents a forecast as fact. When RainViewer has no data, the
              panel says so rather than freezing on a stale frame.
            </InfoDrawer>
          </div>
          <p className="radar-explainer">{explainer}</p>
        </div>
      </header>

      <div className="radar-body">{body}</div>
    </section>
  );
}

export default memo(RadarPanel);
