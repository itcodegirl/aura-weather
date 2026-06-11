const NO_DATA_STATUS = {
  label: "",
  color: "rgba(148, 163, 184, 0.92)",
};

/*
 * AQI uses the EPA's 6-tier classification rather than the 3-bucket
 * shortcut the audit found in the original implementation. Asthma-
 * aware readers need to distinguish AQI 150 (Sensitive) from 350
 * (Hazardous) — collapsing 100–500 into one "Unhealthy" red bucket
 * loses the actionable signal.
 *
 * Tier 3 label is shortened from EPA's full "Unhealthy for Sensitive
 * Groups" so the metric pill can fit it without wrapping; the full
 * explanation lives in the ExposureSection InfoDrawer helpText.
 */
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
  if (aqi <= 150) {
    return { label: "Sensitive", color: "#f97316" };
  }
  if (aqi <= 200) {
    return { label: "Unhealthy", color: "#ef4444" };
  }
  if (aqi <= 300) {
    return { label: "Very Unhealthy", color: "#a855f7" };
  }
  return { label: "Hazardous", color: "#7f1d1d" };
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
