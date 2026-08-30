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

/**
 * What to actually do about the number.
 *
 * Air quality is the only health-relevant reading on the dashboard, and it was
 * rendered as a bare gauge: "156 / Unhealthy" and a colour. A reader who does
 * not already know the EPA scale learns nothing they can act on. Each tier
 * answers the question the number raises — can I go outside, and for how long.
 *
 * Deliberately silent for a missing reading. An absent AQI is not a safe AQI,
 * and "no precautions needed" would be exactly the fake certainty this codebase
 * exists to avoid. Callers render nothing.
 *
 * The wording follows the EPA's own activity guidance rather than inventing
 * medical advice. "Sensitive groups" is spelled out on the tier where it first
 * matters, because the tile label shortens it to "Sensitive".
 */
export function getAqiGuidance(aqi) {
  if (aqi === null || aqi === undefined) {
    return "";
  }
  if (aqi <= 50) {
    return "Air is clean. No precautions needed.";
  }
  if (aqi <= 100) {
    return "Fine for most people. If you are unusually sensitive to air pollution, keep long outdoor sessions shorter.";
  }
  if (aqi <= 150) {
    return "Sensitive groups — asthma, heart or lung conditions, children, older adults — should shorten long or intense outdoor activity.";
  }
  if (aqi <= 200) {
    return "Everyone may notice effects. Cut back on long or intense outdoor activity; sensitive groups should move it indoors.";
  }
  if (aqi <= 300) {
    return "Avoid long or intense outdoor activity. Sensitive groups should stay indoors.";
  }
  return "Stay indoors and keep activity light. Everyone is at risk at this level.";
}

/*
 * Canonical WHO UV bands — the single source of truth for UV severity.
 * Half-open on the minimums (Low <3, Moderate 3–<6, High 6–<8,
 * Very high 8–<11, Extreme ≥11) so fractional readings classify the
 * same everywhere: the hero reading line, characteristic chip, UV
 * panel, guidance pill, and exposure tile once each carried their own
 * thresholds, and a 6.5 rendered as "Moderate", "UV high", and
 * "UV High" on the same card.
 */
const UV_BANDS = [
  { band: "extreme", label: "Extreme", min: 11, color: "#7f1d1d" },
  { band: "very-high", label: "Very High", min: 8, color: "#f43f5e" },
  { band: "high", label: "High", min: 6, color: "#f97316" },
  { band: "moderate", label: "Moderate", min: 3, color: "#eab308" },
  { band: "low", label: "Low", min: 0, color: "#22c55e" },
];

export function classifyUv(uv) {
  if (uv === null || uv === undefined) {
    return null;
  }
  // Sub-zero or non-numeric junk falls through to Low rather than
  // fabricating a higher band.
  return UV_BANDS.find((entry) => uv >= entry.min) ?? UV_BANDS[UV_BANDS.length - 1];
}

export function getUvStatus(uv) {
  const uvBand = classifyUv(uv);
  if (uvBand === null) {
    return NO_DATA_STATUS;
  }
  return { label: uvBand.label, color: uvBand.color };
}
