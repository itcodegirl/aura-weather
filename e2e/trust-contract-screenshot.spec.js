import { test, expect } from "@playwright/test";

/**
 * Captures the missing-data trust-contract screenshot for the README /
 * portfolio. Uses the dev-only ?mock=missing query parameter so the
 * dashboard renders with several null fields without depending on
 * Open-Meteo returning real partial data.
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
    await expect(
      page.getByText("Some readings are unavailable from the provider")
    ).toBeVisible();

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

    await page.screenshot({
      path: "docs/screenshots/trust-contract-mobile.png",
      fullPage: true,
    });
  });
});
