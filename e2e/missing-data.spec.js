import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  await expect(
    page.getByText("Portfolio demo: showing the missing-data trust contract")
  ).toBeVisible();

  const hero = page.locator(".hero-card");
  await expect(hero).toBeVisible();

  const heroText = (await hero.textContent()) ?? "";
  expect(heroText).not.toMatch(/(^|\s)0%/);
  expect(heroText).not.toMatch(/0\s?hPa/);
  expect(heroText).not.toMatch(/—°F/);
  expect(heroText).not.toMatch(/—°C/);

  // The 4-stat grid and its "some readings unavailable" note moved out
  // of the hero (those readings live in the Atmosphere bento now). The
  // hero still honours the contract for its own readings — verify it
  // surfaces a missing-data indicator (the high/low "No data available"
  // span) rather than a fabricated value.
  await expect(
    hero.locator("span[aria-label='No data available']").first()
  ).toBeVisible();
});

test("?mock=missing surfaces the missing-data trust contract via assistive-tech cues", async ({ page }) => {
  await page.goto("/?mock=missing");
  await expect(page.getByRole("main")).toBeVisible();

  // Each missing reading replaces its glyph with a labelled span so AT
  // announces "no data available" instead of speaking the em-dash
  // character literally. At least one of these must be present in the
  // rendered hero card while ?mock=missing is in effect.
  const missingLabels = page
    .locator(".hero-card span[aria-label='No data available']");
  await expect(missingLabels.first()).toBeVisible();
});

test("?mock=missing passes baseline axe-core accessibility checks", async ({ page }) => {
  await page.goto("/?mock=missing");
  await expect(page.getByRole("main")).toBeVisible();
  // Gate the axe analysis on the missing-data state having rendered.
  await expect(
    page.locator("span[aria-label='No data available']").first()
  ).toBeVisible();

  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blockingViolations = report.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );

  expect(
    blockingViolations,
    `Serious a11y issues on ?mock=missing: ${blockingViolations
      .map((issue) => `${issue.id}: ${issue.help}`)
      .join(" | ")}`
  ).toEqual([]);
});
