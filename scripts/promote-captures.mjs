/*
 * Copies a fresh capture set over the tracked images.
 *
 * The capture specs write under test-results/captures/<repo-relative-path>
 * (see e2e/support/capturePath.js) so that an ordinary `npm run test:e2e`
 * cannot dirty tracked files. This is the one place that writes them, which
 * is what makes the write deliberate rather than a side effect.
 *
 * Two ways in:
 *   - `npm run screenshots` calls it after capturing locally.
 *   - Run it directly after unzipping CI's trust-contract-screenshots
 *     artifact into test-results/captures/. Local environments cannot reach
 *     the CARTO / RainViewer tile hosts, so for the map-bearing shots CI is
 *     the only place a real capture can happen -- that artifact plus this
 *     script is the supported path for refreshing them.
 */

import { cp, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CAPTURE_ROOT = resolve(ROOT, "test-results", "captures");

async function collectFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectFiles(full)));
    } else {
      found.push(full);
    }
  }
  return found;
}

/**
 * @param {{ clean?: boolean }} [options] clean removes the capture tree
 *   afterwards so a later unrelated run cannot promote a stale set.
 * @returns {Promise<string[]>} repo-relative paths that were updated
 */
export async function promoteCaptures({ clean = true } = {}) {
  const captured = await collectFiles(CAPTURE_ROOT);
  if (captured.length === 0) {
    throw new Error(
      `No captures found under ${relative(ROOT, CAPTURE_ROOT)}. ` +
        `Run \`npm run screenshots\`, or unzip CI's ` +
        `trust-contract-screenshots artifact there first.`
    );
  }

  const updated = [];
  for (const source of captured) {
    const repoRelative = relative(CAPTURE_ROOT, source);
    await cp(source, resolve(ROOT, repoRelative));
    updated.push(repoRelative);
  }

  if (clean) {
    await rm(CAPTURE_ROOT, { recursive: true, force: true });
  }
  return updated;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const updated = await promoteCaptures();
    for (const file of updated) console.log(`updated ${file}`);
    console.log(`${updated.length} image(s) promoted.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
