import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/*
 * Locks the contract that stops `npm run test:e2e` dirtying tracked images.
 *
 * The capture specs used to write straight into docs/screenshots and
 * public/, so every e2e run -- CI's or a contributor's -- rewrote six
 * tracked PNGs. Binary diffs do not announce themselves, and the churn was
 * committed by accident more than once.
 *
 * Nothing else would catch a regression here: re-pointing one screenshot at
 * a tracked path breaks no test and shows up only as mystery churn weeks
 * later, in someone else's pull request.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CAPTURE_SPECS = [
  "e2e/readme-screenshots.spec.js",
  "e2e/trust-contract-screenshot.spec.js",
  "e2e/social-pwa-assets.spec.js",
];
const TRACKED_PREFIXES = ["docs/", "public/", "src/"];

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("e2e capture isolation", () => {
  test("the spec list matches the specs that actually capture", () => {
    for (const spec of CAPTURE_SPECS) {
      assert.match(
        read(spec),
        /screenshot\(/,
        `${spec} is listed as a capture spec but takes no screenshot`
      );
    }
  });

  test("no capture writes directly into a tracked directory", () => {
    const offenders = [];
    for (const spec of CAPTURE_SPECS) {
      const source = read(spec);
      // A screenshot path given as a bare string literal, e.g. path: "docs/x.png"
      for (const match of source.matchAll(/path:\s*"([^"]+)"/g)) {
        if (TRACKED_PREFIXES.some((p) => match[1].startsWith(p))) {
          offenders.push(`${spec} -> ${match[1]}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "capture paths must go through capturePath() so they land under " +
        `test-results/, not in the working tree:\n  ${offenders.join("\n  ")}`
    );
  });

  test("every capture spec routes through the helper", () => {
    for (const spec of CAPTURE_SPECS) {
      assert.match(
        read(spec),
        /capturePath/,
        `${spec} does not import or use capturePath()`
      );
    }
  });

  test("the helper points somewhere git ignores", () => {
    const helper = read("e2e/support/capturePath.js");
    const root = /CAPTURE_ROOT\s*=\s*"([^"]+)"/.exec(helper);
    assert.ok(root, "capturePath.js should export a literal CAPTURE_ROOT");
    const [top] = root[1].split("/");
    const ignored = read(".gitignore")
      .split("\n")
      .map((line) => line.trim().replace(/\/$/, ""));
    assert.ok(
      ignored.includes(top),
      `.gitignore must cover "${top}" or captures become the churn they replaced`
    );
  });
});
