import { test, expect } from "@playwright/test";
import { mockDeniedGeolocation } from "./support/openMeteoMocks";

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("?mock=missing renders 'Data unavailable' instead of synthetic zeros", async ({ page }) => {
  await page.goto("/?mock=missing");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".hero-location")).toContainText("Sample City");

  const hero = page.locator(".hero-card");
  await expect(hero).toBeVisible();

  const heroText = (await hero.textContent()) ?? "";
  expect(heroText).not.toMatch(/(^|\s)0%/);
  expect(heroText).not.toMatch(/0\s?hPa/);
  expect(heroText).not.toMatch(/—°F/);
  expect(heroText).not.toMatch(/—°C/);

  const heroDataUnavailable = await hero
    .getByText("Data unavailable", { exact: false })
    .count();
  expect(heroDataUnavailable).toBeGreaterThanOrEqual(4);
});
