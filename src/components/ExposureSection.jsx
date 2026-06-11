import { memo } from "react";
import { MetricCard } from "./ui";
import { getAqiStatus, getUvStatus } from "../utils/meteorology";
import { toFiniteNumber } from "../utils/numbers";
import "./MetricPanels.css";

const METRIC_LABEL_IDS = {
  exposure: "metric-exposure",
  airQuality: "metric-air-quality",
  uvIndex: "metric-uv-index",
};

function ExposureSection({
  aqi,
  aqiStatus = "idle",
  uvIndex,
  style,
  isRefreshing = false,
}) {
  const aqiValue = toFiniteNumber(aqi);
  const uvValue = toFiniteNumber(uvIndex);
  const hasAqiData = aqiValue !== null;
  const hasUvData = uvValue !== null;
  const hasFullExposureData = hasAqiData && hasUvData;
  const aqiHealthStatus = getAqiStatus(aqiValue);
  const uvStatus = getUvStatus(uvValue);
  /*
   * AQI scale uses the real EPA range (0–500). The previous cap of 300
   * meant a reading of 400 (wildfire territory) filled the gauge to
   * 100% and the supportText read as "400 out of 300" — mathematically
   * broken and visually misleading because the density-bar's upper
   * scale label said "300". A 0–500 scale fills proportionally and
   * matches the official AQI ceiling.
   */
  const AQI_SCALE_MAX = 500;
  const aqiSupportText = hasAqiData
    ? `Current AQI is ${Math.round(aqiValue)} on a 0–${AQI_SCALE_MAX} scale.`
    : aqiStatus === "unavailable"
      ? "Air quality is unavailable right now. The rest of the dashboard is still live."
    : "Air quality is loading. Check back after the next refresh.";
  const uvSupportText = hasUvData
    ? `Peak UV is ${uvValue.toFixed(1)} on an 11+ scale.`
    : "Today's UV index is unavailable right now. Current conditions are still live.";
  /*
   * Section header status: when both readings are present, the gauges
   * + status pills already convey the data state — no badge needed.
   * Surface a header indicator when one or both readings are missing
   * so the user knows the section is partially or fully unavailable.
   */
  const sectionStatusText = hasFullExposureData
    ? ""
    : hasAqiData || hasUvData
      ? "One reading missing"
      : "Both readings unavailable";

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
        {sectionStatusText ? (
          <span className="metric-context">{sectionStatusText}</span>
        ) : null}
      </div>
      <div className="exposure-grid">
        <MetricCard
          id={METRIC_LABEL_IDS.airQuality}
          title="Air Quality"
          context={hasAqiData ? "AQI" : "Unavailable"}
          titleTag="h4"
          value={aqiValue}
          max={AQI_SCALE_MAX}
          status={aqiHealthStatus}
          gaugeLabel="Air quality index"
          supportText={aqiSupportText}
          helpTitle="AQI scale explained"
          helpText="AQI summarizes air pollution levels. 0–50 is good, 51–100 moderate, 101–150 unhealthy for sensitive groups, 151–200 unhealthy for everyone, 201–300 very unhealthy, and 301+ hazardous."
        />
        <MetricCard
          id={METRIC_LABEL_IDS.uvIndex}
          title="UV Index"
          context={hasUvData ? "Today" : "Unavailable"}
          titleTag="h4"
          value={uvValue}
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
