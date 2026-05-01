import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks";

async function openDashboard(page) {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("loads the dashboard with fallback location and core controls", async ({ page }) => {
  await openDashboard(page);

  await expect(page.locator(".hero-location")).toContainText("Chicago, United States");
  await expect(
    page.getByText(
      "Chicago is already loaded as a starting point. Use your browser location for local conditions right now, or search for any city when you want a different view."
    )
  ).toBeVisible();
  await expect(
    page.getByLabel("Location onboarding").getByRole("button", { name: "Allow location access" })
  ).toBeVisible();
  await expect(page.locator(".location-notice")).toHaveCount(0);
  await expect(page.getByText("Cloud Sync")).toBeVisible();
  await expect(
    page.locator(".header-control-label").filter({ hasText: "Climate Context" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear saved location preference" })
  ).toBeVisible();

  await expect(page.getByRole("heading", { name: "Current Conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near-Term Outlook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risk Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();
});

test("updates hero location when a city is selected from search", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");

  const suggestion = page.getByRole("option", { name: /tokyo/i });
  await expect(suggestion).toBeVisible();
  await suggestion.click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await expect(searchInput).toHaveValue("");
  await expect(page.locator(".location-notice")).toHaveCount(0);
});

test("shows regional alerts fallback for locations outside NWS coverage", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");
  await page.getByRole("option", { name: /tokyo/i }).click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await expect(page.getByText("Alerts unavailable for this region")).toBeVisible();
  await expect(
    page.getByText("Current weather is still live, but NOAA / NWS alert coverage does not extend to this location.")
  ).toBeVisible();
});

test("keeps the mobile dashboard within the viewport width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  await expect(page.getByRole("heading", { name: "Current Conditions" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  expect(hasHorizontalOverflow).toBe(false);
});

test("passes baseline accessibility assertions for the main weather view", async ({ page }) => {
  await openDashboard(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();

  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blockingViolations = report.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );

  expect(
    blockingViolations,
    `Serious a11y issues: ${blockingViolations
      .map((issue) => `${issue.id}: ${issue.help}`)
      .join(" | ")}`
  ).toEqual([]);
});
