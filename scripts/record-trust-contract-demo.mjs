/**
 * Records a short demo of the dashboard toggling between live data and
 * the ?mock=missing trust-contract state, written as a webm to
 * docs/screenshots/trust-contract-demo.webm. The README + case study
 * embed it via an HTML <video> tag (GitHub renders these natively),
 * so the trust-contract narrative has a visible demo instead of asking
 * the reader to imagine the dashboard rendering "—".
 *
 * Run via:
 *   npm run record:trust-contract-demo
 *
 * The dev server must be available on port 45173 — same setup the
 * Playwright suite uses, so this script reuses playwright.config.js's
 * webServer block by spawning `npm run dev`.
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const outputDir = resolve(projectRoot, "docs/screenshots");
const tempVideoDir = resolve(projectRoot, "test-results/trust-contract-demo");
const finalVideoPath = resolve(outputDir, "trust-contract-demo.webm");
const PORT = 45173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function log(message) {
  console.log(`[record-trust-contract-demo] ${message}`);
}

function waitForServer(url, timeoutMs = 60_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const response = await fetch(url, { method: "GET" });
        if (response.ok || response.status === 200) {
          resolvePromise();
          return;
        }
      } catch {
        // server not ready yet
      }
      if (Date.now() - startedAt > timeoutMs) {
        rejectPromise(new Error(`dev server not ready after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

function startDevServer() {
  log(`starting dev server on :${PORT} ...`);
  const child = spawn(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      // npm spawns vite as a grandchild. Killing npm alone orphans vite, whose
      // open pipes keep this process — and the CI step running it — alive
      // forever. A detached child owns a process group we can signal whole.
      detached: process.platform !== "win32",
    }
  );

  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  child.on("error", (error) => {
    log(`dev server failed to start: ${error.message}`);
  });

  return child;
}

async function record() {
  mkdirSync(outputDir, { recursive: true });
  rmSync(tempVideoDir, { recursive: true, force: true });
  mkdirSync(tempVideoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: tempVideoDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();

  log(`loading ${BASE_URL}/ (live forecast frame) ...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  log(`loading ${BASE_URL}/?mock=missing (trust-contract frame) ...`);
  await page.goto(`${BASE_URL}/?mock=missing`, { waitUntil: "domcontentloaded" });
  // Wait long enough for the user to read the missing-data state
  // The hero's "some readings unavailable" note retired when those readings
  // moved into the Atmosphere bento, so this selector never matched and the
  // step always threw. Anchor on the missing-data cue that still exists.
  await page.waitForSelector('span[aria-label="No data available"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(2000);

  await context.close();
  await browser.close();

  const candidates = readdirSync(tempVideoDir)
    .map((name) => resolve(tempVideoDir, name))
    .filter((path) => path.endsWith(".webm"))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`no webm produced in ${tempVideoDir}`);
  }

  rmSync(finalVideoPath, { force: true });
  renameSync(candidates[0], finalVideoPath);
  log(`wrote ${finalVideoPath}`);
  rmSync(tempVideoDir, { recursive: true, force: true });
}

function stopDevServer(server) {
  if (!server?.pid) return;
  try {
    if (process.platform === "win32") {
      server.kill();
    } else {
      // Negative pid signals the whole process group, so vite dies with npm.
      process.kill(-server.pid, "SIGTERM");
    }
  } catch {
    // Already gone.
  }
}

async function main() {
  const server = startDevServer();
  try {
    await waitForServer(`${BASE_URL}/`);
    await record();
  } finally {
    stopDevServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
