#!/usr/bin/env node
//
// Fails when the committed docs/screenshots no longer match what the app
// actually renders.
//
// These images are referenced by the README and reviewed as portfolio
// artifacts, but nothing compared them to reality: `readme-screenshots.spec.js`
// and `trust-contract-screenshot.spec.js` overwrite them on every Playwright
// run, and the result was never checked in. They went two weeks and two
// feature branches out of date without a single failing check, showing a hero
// that claimed "Clear" for a reading the provider never sent.
//
// Byte equality is NOT the right assertion, and this was measured rather than
// assumed: two CI runs of identical application code produced four of five
// images with differing bytes. Sub-pixel rasterisation moves a small number of
// pixels between runs even with the clock frozen, motion disabled and fonts
// pinned. So this compares pixels with a tolerance, and treats a size change
// as an outright failure — a different height means the layout changed, which
// is never rasterisation noise.
//
// Run AFTER Playwright has regenerated the files (they are written in place):
//
//   npm run test:e2e && npm run check:screenshots
//
// Exits 0 when every image is within tolerance, 1 otherwise.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatchModule from "pixelmatch";

const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;

// Measured from two CI runs of identical code (2026-07-10): the dashboards sat
// at 0 and 5.5e-3, the trust-contract shots were unusable until the mount waits
// landed. 1% leaves room for antialiasing without hiding a real change: a
// changed word, an added line, a recoloured token all move far more than that.
const MAX_DIFF_PIXEL_RATIO = 0.01;

const IMAGES = [
  "docs/screenshots/dashboard-desktop.png",
  "docs/screenshots/dashboard-mobile.png",
  "docs/screenshots/alert-overflow.png",
  "docs/screenshots/trust-contract-desktop.png",
  "docs/screenshots/trust-contract-mobile.png",
];

function committedBytes(path) {
  try {
    return execFileSync("git", ["show", `HEAD:${path}`], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

const failures = [];

for (const path of IMAGES) {
  const committedRaw = committedBytes(path);
  if (!committedRaw) {
    failures.push(`${path}: not committed — add it, or drop it from this list`);
    continue;
  }

  let regenerated;
  try {
    regenerated = PNG.sync.read(readFileSync(path));
  } catch (error) {
    failures.push(`${path}: could not read the regenerated image (${error.message}). ` +
      "Run the Playwright suite first — it writes these files.");
    continue;
  }

  const committed = PNG.sync.read(committedRaw);

  if (committed.width !== regenerated.width || committed.height !== regenerated.height) {
    failures.push(
      `${path}: size changed ${committed.width}x${committed.height} -> ` +
        `${regenerated.width}x${regenerated.height}. The layout moved; the ` +
        "committed screenshot is stale."
    );
    continue;
  }

  const { width, height } = committed;
  const diff = new PNG({ width, height });
  const changed = pixelmatch(committed.data, regenerated.data, diff.data, width, height, {
    threshold: 0.2,
  });
  const ratio = changed / (width * height);

  if (ratio > MAX_DIFF_PIXEL_RATIO) {
    failures.push(
      `${path}: ${changed} pixels differ (ratio ${ratio.toFixed(4)}, limit ` +
        `${MAX_DIFF_PIXEL_RATIO}). The committed screenshot is stale.`
    );
  } else {
    console.log(`  ok  ${path}  (${changed} px, ratio ${ratio.toFixed(5)})`);
  }
}

if (failures.length) {
  console.error("\nCommitted README screenshots are out of date:\n");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    "\nRegenerate and commit them:\n" +
      "  npm run screenshots     (needs a local Chromium)\n" +
      "or download the `trust-contract-screenshots` artifact from this CI run,\n" +
      "copy it over docs/screenshots/, review the images, and commit.\n"
  );
  process.exit(1);
}

console.log(`\nAll ${IMAGES.length} README screenshots match the rendered app.`);
