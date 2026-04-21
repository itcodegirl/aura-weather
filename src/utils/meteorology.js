export {
  classifyStormRisk,
  calculatePressureTrend,
  classifyComfort,
} from "../domain/meteorology.js";
export { windDirectionName, classifyWind } from "../domain/wind.js";

const NO_DATA_STATUS = {
  label: "",
  color: "rgba(148, 163, 184, 0.92)",
};

export function getAqiStatus(aqi) {
  if (aqi === null || aqi === undefined) {
    return NO_DATA_STATUS;
  }
  if (aqi <= 50) {
    return { label: "Good", color: "#22c55e" };
  }
  if (aqi <= 100) {
    return { label: "Moderate", color: "#eab308" };
  }
  return { label: "Unhealthy", color: "#ef4444" };
}

export function getUvStatus(uv) {
  if (uv === null || uv === undefined) {
    return NO_DATA_STATUS;
  }
  if (uv <= 2) {
    return { label: "Low", color: "#22c55e" };
  }
  if (uv <= 5) {
    return { label: "Moderate", color: "#eab308" };
  }
  if (uv <= 7) {
    return { label: "High", color: "#f97316" };
  }
  if (uv <= 10) {
    return { label: "Very High", color: "#f43f5e" };
  }
  return { label: "Extreme", color: "#7f1d1d" };
}
