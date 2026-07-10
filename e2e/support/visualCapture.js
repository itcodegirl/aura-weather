import { expect } from "@playwright/test";
import { installOpenMeteoMocks, mockDeniedGeolocation } from "./openMeteoMocks.js";

/**
 * One bootstrap for every image this repo captures.
 *
 * The visual-regression baselines and the committed docs/screenshots used to
 * bootstrap the page separately. Only the baseline path grew the waits that
 * make a capture reproducible, so the docs screenshots silently drifted: with
 * identical application code, trust-contract-mobile.png came out 390x1290 in
 * one CI run and 390x1936 in another, because `fullPage: true` fired while the
 * lazily-mounted panels were still arriving and the page was still growing.
 *
 * Everything that captures an image now shares these helpers, so no screenshot
 * can be taken of a half-mounted page.
 */

const FIXED_TIMESTAMP_ISO = "2026-04-21T12:00:00-05:00";

export async function forceLazyPanelsToPaint(page) {
  await page.addStyleTag({
    content: `
      .bento-nowcast,
      .bento-chart,
      .bento-forecast,
      .bento-alerts,
      .bento-storm,
      .bento-source-health {
        content-visibility: visible !important;
        contain-intrinsic-block-size: auto !important;
      }
    `,
  });
}

export async function installFixedClock(page) {
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

export async function applyVisualOverrides(page) {
  await forceLazyPanelsToPaint(page);
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

/**
 * The supplemental panels mount through Suspense + an idle callback, so the
 * page keeps growing after `main` becomes visible. Waiting for the last two
 * groups is what stops a full-page screenshot from capturing a transient,
 * shorter layout.
 */
async function waitForSupplementalPanels(page) {
  await expect(
    page.getByRole("heading", { name: "Atmospheric Conditions" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();
}

export async function bootstrapVisualState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await installFixedClock(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".bento-chart .chart-title")).toBeVisible();
  await expect(page.locator(".bento-storm .storm-title")).toBeVisible();
  await waitForSupplementalPanels(page);

  await applyVisualOverrides(page);
}

export async function bootstrapMissingMockState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // ?mock=missing short-circuits all real fetches, but denying geolocation
  // keeps the visual identical between local + CI runs in case any other
  // permission prompt nudges layout.
  await mockDeniedGeolocation(context);
  await installFixedClock(page);

  await page.goto("/?mock=missing");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Current Conditions" })
  ).toBeVisible();
  // A missing-data indicator proves the trust contract has fully rendered and
  // is not still in a transient state.
  await expect(
    page.locator("span[aria-label='No data available']").first()
  ).toBeVisible();
  await waitForSupplementalPanels(page);

  await applyVisualOverrides(page);
}
