import { test, expect } from "@playwright/test";
import {
  bootstrapMissingMockState,
  bootstrapVisualState,
} from "./support/visualCapture";

const SNAPSHOT_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 900, height: 1200 },
  { name: "mobile", width: 390, height: 844 },
];

const TRUST_CONTRACT_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// The bootstrap helpers moved to support/visualCapture.js so the committed
// docs/screenshots are captured through exactly the same waits as these
// baselines. They drifted precisely because they were not.

for (const viewport of SNAPSHOT_VIEWPORTS) {
  test(`matches dashboard visuals at ${viewport.name}`, async ({ page, context }) => {
    await bootstrapVisualState(page, context, viewport);

    await expect(page.locator(".app-inner")).toHaveScreenshot(
      `dashboard-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: viewport.name === "mobile" ? 0.025 : 0.01,
        timeout: 20_000,
      }
    );
  });
}

for (const viewport of TRUST_CONTRACT_VIEWPORTS) {
  test(`matches trust-contract (?mock=missing) visuals at ${viewport.name}`, async ({
    page,
    context,
  }) => {
    await bootstrapMissingMockState(page, context, viewport);

    await expect(page.locator(".app-inner")).toHaveScreenshot(
      `trust-contract-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        // Slightly more tolerant than the dashboard baseline because the
        // missing-data path renders several em-dash glyphs that hint at
        // sub-pixel rasterisation differences across browser builds.
        maxDiffPixelRatio: 0.02,
        timeout: 20_000,
      }
    );
  });
}
