/*
 * Geometry for the nowcast strip. Plain JS beside analyzeNowcast.js rather
 * than inside the component: it is pure arithmetic over the probability
 * series, and the trust-contract behaviour below is worth testing directly
 * instead of through a render.
 */
export const NC_SVG_W = 1000;
export const NC_SVG_H = 150;
export const NC_TOP_PAD = 20;
export const NC_BOT_PAD = 24;
export const NC_DOMAIN = 100; // full 0-100% range so high-rain windows slope instead of pegging flat at the cap
// The "Rain likely" reference line. 50% is the app-wide "likely" cutoff —
// RainCard and HourlyCard both draw their likely threshold at 50% — so the
// same word means the same probability everywhere. (Previously 40%, which
// disagreed with the rest of the dashboard.)
export const NC_LIKELY_THRESHOLD = 50;

/*
 * A bar per 15-minute step.
 *
 * Two weights, and the distinction is the honest part. Measured live against
 * Open-Meteo on 2026-09-19 (Chicago 41.70,-87.82, 192 quarter-hour points
 * against 48 hourly): every one of the 47 on-the-hour points equalled the
 * hourly value exactly, and the points between them sat on the line joining
 * their neighbours -- mean deviation 0.53 percentage points, max 2.0. Berlin,
 * inside the region Open-Meteo documents as natively 15-minutely, gave the
 * same signature (47/47 anchors, mean 0.41). So for precipitation_probability
 * the quarter-hour series is an expansion of the hourly one, not an
 * independent reading at 15-minute resolution.
 *
 * Eight equal bars would claim eight readings. The on-the-hour steps are
 * drawn solid; the steps between them are drawn as outlines, because they
 * carry no information the hourly points do not already carry.
 *
 * "Anchor" here means an on-the-hour forecast value, not a measurement.
 * Nothing in this series is measured -- it is all forecast -- and the
 * distinction the outline draws is hourly-forecast versus interpolated.
 *
 * Anchors are found from the timestamps rather than by index, because the
 * window starts at whatever quarter-hour is current: a window beginning at
 * :00 holds three on-the-hour points, one beginning at :15, :30 or :45 holds
 * two.
 */
function isHourAnchor(isoLocalTime) {
  if (typeof isoLocalTime !== "string") return false;
  // Open-Meteo returns the location's naive wall clock ("2026-09-19T14:00"),
  // so the minutes can be read off the string without a timezone round-trip.
  const match = /T(\d{2}):(\d{2})/.exec(isoLocalTime);
  return match !== null && match[2] === "00";
}

export function buildNowcastBarGeometry(points, times = []) {
  const n = points.length;
  if (n < 1) return null;
  const span = NC_SVG_H - NC_TOP_PAD - NC_BOT_PAD;
  const base = NC_SVG_H - NC_BOT_PAD;
  const slot = NC_SVG_W / n;
  // Gap scales with the slot so 8 bars read as bars and 96 still read as a
  // strip rather than merging into a block.
  const gap = Math.min(slot * 0.22, 6);
  const width = Math.max(slot - gap, 1);
  const isMissing = (v) => v === null || v === undefined;

  const bars = [];
  const dry = [];
  const gaps = [];
  let anchorCount = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i * slot + gap / 2;
    const anchor = isHourAnchor(times[i]);
    if (anchor) anchorCount += 1;
    const v = points[i];
    if (isMissing(v)) {
      gaps.push({ x, width, anchor });
      continue;
    }
    const clamped = Math.max(0, Math.min(v, NC_DOMAIN));
    if (clamped <= 0) {
      dry.push({ x, width, anchor });
      continue;
    }
    const h = Math.max((clamped / NC_DOMAIN) * span, 1.5);
    bars.push({
      x,
      width,
      y: base - h,
      height: h,
      anchor,
      likely: clamped >= NC_LIKELY_THRESHOLD,
    });
  }
  return {
    bars,
    dry,
    gaps,
    anchorCount,
    base,
    thresholdY: base - (NC_LIKELY_THRESHOLD / NC_DOMAIN) * span,
  };
}
