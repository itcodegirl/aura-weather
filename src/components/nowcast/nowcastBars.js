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
 * A bar per 15-minute step, the shape a minute-cast strip has: height is
 * the chance, a dry step is a baseline dash rather than a zero-height bar,
 * and a missing step is a gap with neither — a slot the provider did not
 * report must not read as "no rain", which is the whole trust contract.
 *
 * Bars carry the same 50% "likely" cutoff the curve's threshold line does,
 * so the colour change and the dashed rule agree.
 */
export function buildNowcastBarGeometry(points) {
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
  for (let i = 0; i < n; i += 1) {
    const x = i * slot + gap / 2;
    const v = points[i];
    if (isMissing(v)) {
      gaps.push({ x, width });
      continue;
    }
    const clamped = Math.max(0, Math.min(v, NC_DOMAIN));
    if (clamped <= 0) {
      dry.push({ x, width });
      continue;
    }
    const h = Math.max((clamped / NC_DOMAIN) * span, 1.5);
    bars.push({ x, width, y: base - h, height: h, likely: clamped >= NC_LIKELY_THRESHOLD });
  }
  return { bars, dry, gaps, base, thresholdY: base - (NC_LIKELY_THRESHOLD / NC_DOMAIN) * span };
}
