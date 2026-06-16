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
