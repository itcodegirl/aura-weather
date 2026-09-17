import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Every caller of `resolveWindowStart` must be covered by a stale-series test.
 *
 * `staleWindow.test.mjs` drives six call sites and names them in its header.
 * A list in a comment is a list that goes stale: the seventh caller lands,
 * nobody adds a case, and the suite still reports green over an uncovered
 * surface. That is the same shape as the bug the whole unit is about — an
 * all-clear that means "nothing looked", not "nothing wrong".
 *
 * So the list is derived here instead. This walks the source tree for real
 * call sites and asserts the documented set still matches. Adding a caller
 * fails this test until it is both listed and covered.
 *
 * What this cannot check is whether the new caller's test is any GOOD — only
 * that one exists and names the file. That is a real limit, recorded rather
 * than papered over; the alternative was no check at all.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__fixtures__"]);

/** Files that hold the call sites, and the file that must cover each. */
const COVERED_BY = {
  "components/nowcast/analyzeNowcast.js": "utils/staleWindow.test.mjs",
  "hooks/useRainAnalysis.js": "utils/staleWindow.test.mjs",
  "components/heroCard/buildAtmosphereReading.js": "utils/staleWindow.test.mjs",
  "domain/forecastNow.js": "utils/staleWindow.test.mjs",
  "domain/meteorology.js": "utils/staleWindow.test.mjs",
  // These two call from inside a component body rather than an exported
  // function, so they are driven through the DOM in their own render suites.
  "components/StormWatch.jsx": "components/StormWatch.render.test.mjs",
  "components/HourlyCard.jsx": "components/HourlyCard.render.test.mjs",
};

function collectSourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
      continue;
    }
    if (/\.(js|jsx)$/.test(entry) && !entry.includes(".test.")) {
      found.push(full);
    }
  }
  return found;
}

const CALL_SITE = /\bresolveWindowStart\s*\(/;

function callerFiles() {
  return collectSourceFiles(SRC)
    .filter((file) => CALL_SITE.test(readFileSync(file, "utf8")))
    .map((file) => relative(SRC, file).split("\\").join("/"))
    .filter((rel) => rel !== "utils/timeSeries.js")
    .sort();
}

describe("stale-series coverage of resolveWindowStart", () => {
  test("the detector finds a call and ignores a mention", () => {
    // Positive control. A regex that matched nothing would make the
    // comparison below pass over an empty set — "no callers, all covered".
    assert.ok(CALL_SITE.test("const { index } = resolveWindowStart(times, {});"));
    assert.ok(CALL_SITE.test("  resolveWindowStart (a, b)"));
    assert.ok(!CALL_SITE.test("// see resolveWindowStart for why"));
    assert.ok(!CALL_SITE.test("import { resolveWindowStart } from './x.js';"));
  });

  test("the walk sees a real source tree", () => {
    assert.ok(
      collectSourceFiles(SRC).length > 50,
      "expected a real source tree; the walk found almost nothing"
    );
  });

  test("the documented caller list matches the code", () => {
    assert.deepEqual(
      callerFiles(),
      Object.keys(COVERED_BY).sort(),
      "a caller of resolveWindowStart was added or removed. Add a stale-series " +
        "case for it, then list it here — an uncovered caller is how the clamp " +
        "bug reached six surfaces unnoticed."
    );
  });

  test("each covering suite exists and names the file it covers", () => {
    for (const [caller, suite] of Object.entries(COVERED_BY)) {
      const body = readFileSync(join(SRC, suite), "utf8");
      const basename = caller.split("/").pop();
      assert.ok(
        body.includes(basename) || body.includes(caller),
        `${suite} is meant to cover ${caller} but never mentions it`
      );
    }
  });
});
