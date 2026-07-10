import { test } from "@playwright/test";
import { bootstrapMissingMockState } from "./support/visualCapture.js";

/**
 * Captures the missing-data trust-contract screenshot for the README /
 * portfolio. Uses the labelled ?mock=missing demo state so the dashboard
 * renders with several null fields without depending on Open-Meteo
 * returning real partial data.
 *
 * The output PNGs are written to docs/screenshots/, uploaded as a CI artifact,
 * and compared against the committed copies by
 * scripts/check-readme-screenshots.mjs so they cannot drift unnoticed.
 *
 * Bootstrapping is shared with the visual-regression baselines. It used to be
 * duplicated here without the waits for the lazily-mounted panels, which is
 * why these captures varied in height from run to run.
 */
test.describe("trust contract screenshots", () => {
  test("captures the desktop missing-data state", async ({ page, context }) => {
    await bootstrapMissingMockState(page, context, { width: 1366, height: 900 });

    await page.screenshot({
      path: "docs/screenshots/trust-contract-desktop.png",
      fullPage: true,
    });
  });

  test("captures the mobile missing-data state", async ({ page, context }) => {
    await bootstrapMissingMockState(page, context, { width: 390, height: 844 });

    await page.screenshot({
      path: "docs/screenshots/trust-contract-mobile.png",
      fullPage: true,
    });
  });
});
