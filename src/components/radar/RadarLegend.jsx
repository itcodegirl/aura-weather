import { memo } from "react";

// Static intensity key for RainViewer's Universal Blue (colour scheme 4)
// plus the required attribution for the radar source and the base map.
function RadarLegend() {
  return (
    <div className="radar-legend">
      <div className="radar-legend-scale">
        <span className="radar-legend-cap">Light</span>
        <span className="radar-legend-bar" aria-hidden="true" />
        <span className="radar-legend-cap">Heavy</span>
      </div>
      {/*
       * RainViewer's catalogue is global but its coverage is not. Outside a
       * covered region the frames still arrive and still say "Observed", and
       * the tiles are simply transparent — so an uncovered map is pixel-wise
       * identical to a dry one. Nothing downstream can tell the two apart
       * (deriveRadarState only knows error / empty / ready), so rather than
       * let a clear map assert "no rain", the panel says plainly what a
       * clear map does and does not mean. Persistent, not conditional:
       * the ambiguity is always present, and a caption that appeared only
       * sometimes would itself become a signal.
       */}
      <p className="radar-legend-note">
        Radar shows precipitation echoes only — a clear map can also mean no
        coverage in this region.
      </p>
      <p className="radar-legend-attribution">
        Radar{" "}
        <a
          href="https://www.rainviewer.com/"
          target="_blank"
          rel="noreferrer noopener"
        >
          RainViewer
        </a>{" "}
        · Base{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer noopener"
        >
          OpenStreetMap
        </a>
        ,{" "}
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noreferrer noopener"
        >
          CARTO
        </a>
      </p>
    </div>
  );
}

export default memo(RadarLegend);
