import { memo } from "react";
import { DataTrustMeta, MetricCard } from "./ui";
import { getAqiStatus, getUvStatus } from "../utils/meteorology";
import "./MetricPanels.css";

const METRIC_LABEL_IDS = {
  exposure: "metric-exposure",
  airQuality: "metric-air-quality",
  uvIndex: "metric-uv-index",
};

function ExposureSection({
  aqi,
  uvIndex,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const hasAqiData = Number.isFinite(Number(aqi));
  const hasUvData = Number.isFinite(Number(uvIndex));
  const hasFullExposureData = hasAqiData && hasUvData;
  const aqiStatus = getAqiStatus(aqi);
  const uvStatus = getUvStatus(uvIndex);
  const aqiSupportText = hasAqiData
    ? `Current AQI is ${Math.round(Number(aqi))} out of 300.`
    : "Air quality data is temporarily unavailable.";
  const uvSupportText = hasUvData
    ? `Peak UV is ${Number(uvIndex).toFixed(1)} on an 11+ scale.`
    : "UV data is temporarily unavailable.";

  return (
    <section
      className="bento-exposure exposure-card metric-card glass"
      style={style}
      aria-labelledby={METRIC_LABEL_IDS.exposure}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <div className="metric-head">
        <h3 id={METRIC_LABEL_IDS.exposure} className="metric-label">
          Environmental Exposure
        </h3>
        <span className="metric-context">{hasFullExposureData ? "Live" : "Partial data"}</span>
      </div>
      <DataTrustMeta
        sourceLabel="Open-Meteo Air Quality"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
      />

      <div className="exposure-grid">
        <MetricCard
          id={METRIC_LABEL_IDS.airQuality}
          title="Air Quality"
          context={hasAqiData ? "AQI" : "AQI offline"}
          value={aqi}
          max={300}
          status={aqiStatus}
          gaugeLabel="Air quality index"
          supportText={aqiSupportText}
          helpTitle="AQI scale explained"
          helpText="AQI summarizes air pollution levels. 0 to 50 is generally good, 51 to 100 is moderate, and values above 100 indicate less healthy air."
        />
        <MetricCard
          id={METRIC_LABEL_IDS.uvIndex}
          title="UV Index"
          context={hasUvData ? "Today" : "UV offline"}
          value={uvIndex}
          max={11}
          status={uvStatus}
          gaugeLabel="UV index"
          decimals={1}
          supportText={uvSupportText}
          helpTitle="UV scale explained"
          helpText="UV index estimates sunburn risk. 0 to 2 is low, 3 to 5 is moderate, 6 to 7 is high, 8 to 10 is very high, and 11+ is extreme."
        />
      </div>
    </section>
  );
}

export default memo(ExposureSection);
