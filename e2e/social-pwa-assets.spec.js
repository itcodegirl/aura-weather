import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";

/**
 * Captures the committed social-share and PWA-manifest images:
 *
 *   - public/og-image.png                  1200x630 Open Graph / Twitter
 *                                          summary_large_image card
 *   - public/screenshots/aura-narrow.png   390x844 manifest screenshot
 *                                          (form_factor: narrow)
 *   - public/screenshots/aura-wide.png     1280x800 manifest screenshot
 *                                          (form_factor: wide)
 *
 * Same determinism contract as readme-screenshots.spec.js: provider
 * mocks, frozen clock, animations off, and Arial-pinned fonts so the
 * committed binaries stay stable across regenerations. Run via
 * `npm run screenshots`.
 */
const FIXED_TIMESTAMP_ISO = "2026-04-21T12:00:00-05:00";

async function freezeTime(page) {
  await page.addInitScript(({ fixedIso }) => {
    window.localStorage.clear();
    const fixedTime = new Date(fixedIso).valueOf();
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedTime);
          return;
        }
        super(...args);
      }

      static now() {
        return fixedTime;
      }
    }

    Object.setPrototypeOf(MockDate, RealDate);
    globalThis.Date = MockDate;
  }, { fixedIso: FIXED_TIMESTAMP_ISO });
}

async function disableMotionAndPinFont(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      :root {
        --font-sans: Arial, sans-serif !important;
        --font-display: Arial, sans-serif !important;
      }
    `,
  });
}

async function bootstrapDashboard(page, context, viewport) {
  await page.setViewportSize(viewport);
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await freezeTime(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".bento-chart .chart-title")).toBeVisible();
  await disableMotionAndPinFont(page);
}

test.describe("social and PWA manifest assets", () => {
  test("captures the 1200x630 Open Graph card", async ({ page, context }) => {
    await bootstrapDashboard(page, context, { width: 1200, height: 630 });

    // Dismiss the location-onboarding banner so the card is the branded
    // header plus the full hero conditions, not setup copy.
    const keepDefaultCity = page.getByRole("button", { name: "Keep Palos Hills for now" });
    if (await keepDefaultCity.isVisible()) {
      await keepDefaultCity.click();
      await expect(keepDefaultCity).toHaveCount(0);
    }

    // The hero card is taller than the 630px card height at natural
    // scale, so zoom the page out slightly before cropping — the full
    // hero plus the exposure gauges then fit the 2:1 frame.
    await page.evaluate(() => {
      document.body.style.zoom = "0.82";
    });

    // Document-relative clip anchored just above the hero card: the
    // strongest single-frame summary of the app for a 2:1 social crop.
    const heroBox = await page.locator(".bento-hero").first().boundingBox();
    const clipTop = Math.max(0, Math.round((heroBox?.y ?? 0) - 24));
    await page.screenshot({
      path: "public/og-image.png",
      clip: { x: 0, y: clipTop, width: 1200, height: 630 },
    });
  });

  test("captures the narrow manifest screenshot", async ({ page, context }) => {
    await bootstrapDashboard(page, context, { width: 390, height: 844 });
    await page.screenshot({ path: "public/screenshots/aura-narrow.png" });
  });

  test("captures the wide manifest screenshot", async ({ page, context }) => {
    await bootstrapDashboard(page, context, { width: 1280, height: 800 });
    await page.screenshot({ path: "public/screenshots/aura-wide.png" });
  });
});
