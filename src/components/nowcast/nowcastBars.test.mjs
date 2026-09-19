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

/*
 * Anchors are on-the-hour points in the *location's* wall clock. Open-Meteo
 * returns naive local timestamps, so the minutes are read off the string; a
 * viewer in another zone must not shift which bars are solid. The half-hour
 * offsets are the ones that would expose a Date round-trip: at +05:30 or
 * +09:30, parsing and re-formatting moves every :00 to :30.
 */
describe("hour anchors", () => {
  const AT_QUARTER = [
    "2026-09-19T10:15", "2026-09-19T10:30", "2026-09-19T10:45",
    "2026-09-19T11:00", "2026-09-19T11:15", "2026-09-19T11:30",
    "2026-09-19T11:45", "2026-09-19T12:00",
  ];
  const AT_HOUR = [
    "2026-09-19T10:00", "2026-09-19T10:15", "2026-09-19T10:30",
    "2026-09-19T10:45", "2026-09-19T11:00", "2026-09-19T11:15",
    "2026-09-19T11:30", "2026-09-19T11:45",
  ];
  const values = [10, 20, 30, 40, 50, 60, 70, 80];

  test("a window opening on the hour holds three anchors", () => {
    const geo = buildNowcastBarGeometry(values, AT_HOUR);
    assert.equal(geo.anchorCount, 2, "10:00 and 11:00 are inside these eight");
    assert.deepEqual(
      geo.bars.map((b) => b.anchor),
      [true, false, false, false, true, false, false, false]
    );
  });

  test("a window opening mid-hour holds two, in different places", () => {
    const geo = buildNowcastBarGeometry(values, AT_QUARTER);
    assert.equal(geo.anchorCount, 2);
    assert.deepEqual(
      geo.bars.map((b) => b.anchor),
      [false, false, false, true, false, false, false, true]
    );
  });

  test("an offset-bearing timestamp is read by its wall clock, in any zone", async () => {
    // This is the case where reading the minutes and round-tripping through
    // Date diverge. A naive string parses as local time, so Date agrees with
    // the wall clock everywhere and proves nothing; give the timestamp an
    // explicit offset and run in a half-hour zone, and Date reports :30 for a
    // point whose wall clock says :00.
    //
    // Run in a child process: Node caches the zone at startup, so setting
    // process.env.TZ from inside a test does not take effect.
    const script = `
      import assert from "node:assert/strict";
      const { buildNowcastBarGeometry } = await import("${new URL("./nowcastBars.js", import.meta.url).pathname}");
      assert.equal(new Date("2026-09-19T11:00-05:00").getMinutes(), 30,
        "precondition: this zone is one where Date would disagree");
      const geo = buildNowcastBarGeometry([10, 20], ["2026-09-19T11:00-05:00", "2026-09-19T11:15-05:00"]);
      assert.deepEqual(geo.bars.map((b) => b.anchor), [true, false]);
    `;
    const { promisify } = await import("node:util");
    const execFile = promisify((await import("node:child_process")).execFile);
    await execFile(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: "Asia/Kolkata" },
    });
  });

  test("a step with no timestamp is not an anchor", () => {
    const geo = buildNowcastBarGeometry([10, 20], [undefined, null]);
    assert.deepEqual(geo.bars.map((b) => b.anchor), [false, false]);
    assert.equal(geo.anchorCount, 0);
  });

  test("dry steps and gaps carry the anchor flag too", () => {
    const geo = buildNowcastBarGeometry(
      [0, null],
      ["2026-09-19T11:00", "2026-09-19T11:15"]
    );
    assert.equal(geo.dry[0].anchor, true);
    assert.equal(geo.gaps[0].anchor, false);
  });
});
