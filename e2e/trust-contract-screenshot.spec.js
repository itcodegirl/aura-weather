import { test, expect } from "@playwright/test";
import { forceLazyPanelsToPaint } from "./support/visualCapture.js";

/**
 * Captures the missing-data trust-contract screenshot for the README /
 * portfolio. Uses the labelled ?mock=missing demo state so the dashboard
 * renders with several null fields without depending on Open-Meteo
 * returning real partial data.
 *
 * The output PNGs are written to docs/screenshots/ and uploaded as a
 * CI artifact via the quality-gates workflow. The README links the
 * desktop shot directly so the trust narrative has a visible asset.
 */
test.describe("trust contract screenshots", () => {
  test("captures the desktop missing-data state", async ({ page }) => {
    await page.goto("/?mock=missing");
    await expect(
      page.getByRole("heading", { name: "Current Conditions" })
    ).toBeVisible();
    // The hero no longer carries a "some readings unavailable" note (those
    // readings moved to the Atmosphere bento). Anchor the capture on the
    // hero's high/low missing-data indicator instead — still a non-lazy,
    // hero-level proof that the missing-data state has rendered.
    await expect(
      page.getByRole("img", { name: "No data available" }).first()
    ).toBeVisible();
    await forceLazyPanelsToPaint(page);

    await page.screenshot({
      path: "docs/screenshots/trust-contract-desktop.png",
      fullPage: true,
    });
  });

  test("captures the mobile missing-data state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mock=missing");
    await expect(
      page.getByRole("heading", { name: "Current Conditions" })
    ).toBeVisible();
    await forceLazyPanelsToPaint(page);

    await page.screenshot({
      path: "docs/screenshots/trust-contract-mobile.png",
      fullPage: true,
    });
  });
});
