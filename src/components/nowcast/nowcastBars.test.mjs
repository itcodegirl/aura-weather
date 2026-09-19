import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildNowcastBarGeometry } from "./nowcastBars.js";

/*
 * The strip's trust contract. A 15-minute slot the provider did not report
 * must draw nothing — not a zero-height bar, and not the dry baseline —
 * because both of those read as "no rain in that quarter hour", which is
 * the fabricated-zero this app exists to avoid. A genuine 0% is a
 * different statement and gets the baseline dash.
 */
describe("the nowcast bar strip", () => {
  test("a missing step draws neither a bar nor a dry baseline", () => {
    const geo = buildNowcastBarGeometry([40, null, 60, undefined, 0]);
    assert.equal(geo.gaps.length, 2, "both missing steps should be gaps");
    assert.equal(geo.bars.length, 2, "only the two reported non-zero steps are bars");
    assert.equal(geo.dry.length, 1, "the reported zero is a dry baseline, not a gap");
  });

  test("a reported zero is dry, and is not confusable with a missing step", () => {
    const zero = buildNowcastBarGeometry([0]);
    const missing = buildNowcastBarGeometry([null]);
    assert.deepEqual([zero.dry.length, zero.gaps.length], [1, 0]);
    assert.deepEqual([missing.dry.length, missing.gaps.length], [0, 1]);
  });

  test("bars cross to the likely tone at the same 50% the rule is drawn at", () => {
    const geo = buildNowcastBarGeometry([49, 50, 51]);
    assert.deepEqual(geo.bars.map((b) => b.likely), [false, true, true]);
  });

  test("height tracks the reading, and the strip fills the width at any count", () => {
    for (const n of [8, 24, 96]) {
      const geo = buildNowcastBarGeometry(Array.from({ length: n }, () => 50));
      assert.equal(geo.bars.length, n);
      const last = geo.bars[n - 1];
      assert.ok(last.x + last.width <= 1000.5, `${n} bars should not overflow the viewBox`);
      assert.ok(last.width > 0, `${n} bars should each have width`);
    }
    const [low, high] = buildNowcastBarGeometry([10, 90]).bars;
    assert.ok(high.height > low.height, "a higher chance is a taller bar");
  });

  test("a value above the domain clamps instead of overflowing the plot", () => {
    const [bar] = buildNowcastBarGeometry([140]).bars;
    const [full] = buildNowcastBarGeometry([100]).bars;
    assert.equal(bar.height, full.height);
  });
});
