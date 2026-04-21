import { MetricCard } from "./ui";
import { getAqiStatus, getUvStatus } from "../utils/meteorology";
import "./MetricPanels.css";

const METRIC_LABEL_IDS = {
  exposure: "metric-exposure",
  airQuality: "metric-air-quality",
  uvIndex: "metric-uv-index",
};

export default function ExposureSection({ aqi, uvIndex, style }) {
  const aqiStatus = getAqiStatus(aqi);
  const uvStatus = getUvStatus(uvIndex);
  const aqiSupportText = Number.isFinite(Number(aqi))
    ? `Current AQI is ${Math.round(Number(aqi))} out of 300.`
    : "Air quality data is temporarily unavailable.";
  const uvSupportText = Number.isFinite(Number(uvIndex))
    ? `Peak UV is ${Number(uvIndex).toFixed(1)} on an 11+ scale.`
    : "UV data is temporarily unavailable.";

  return (
    <section
      className="bento-exposure exposure-card metric-card glass"
      style={style}
      aria-labelledby={METRIC_LABEL_IDS.exposure}
    >
      <div className="metric-head">
        <h2 id={METRIC_LABEL_IDS.exposure} className="metric-label">
          Environmental Exposure
        </h2>
        <span className="metric-context">Live</span>
      </div>

      <div className="exposure-grid">
        <MetricCard
          id={METRIC_LABEL_IDS.airQuality}
          title="Air Quality"
          context="AQI"
          value={aqi}
          max={300}
          status={aqiStatus}
          gaugeLabel="Air quality index"
          supportText={aqiSupportText}
        />
        <MetricCard
          id={METRIC_LABEL_IDS.uvIndex}
          title="UV Index"
          context="Today"
          value={uvIndex}
          max={11}
          status={uvStatus}
          gaugeLabel="UV index"
          decimals={1}
          supportText={uvSupportText}
        />
      </div>
    </section>
  );
}
