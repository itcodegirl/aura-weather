import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks";
import { forceLazyPanelsToPaint } from "./support/visualCapture";

const SNAPSHOT_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 900, height: 1200 },
  { name: "mobile", width: 390, height: 844 },
];

const TRUST_CONTRACT_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const FIXED_TIMESTAMP_ISO = "2026-04-21T12:00:00-05:00";

async function installFixedClock(page) {
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

async function applyVisualOverrides(page) {
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

async function bootstrapVisualState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await installFixedClock(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".bento-chart .chart-title")).toBeVisible();
  await expect(page.locator(".bento-storm .storm-title")).toBeVisible();

  await applyVisualOverrides(page);
}

async function bootstrapMissingMockState(page, context, viewport) {
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
  // Wait for a missing-data indicator — its presence proves the trust
  // contract is fully rendered and not still in a transient state. (The
  // hero's "some readings unavailable" note retired with the 4-stat grid;
  // the high/low "No data available" span is the surviving cue.)
  await expect(
    page.locator("span[aria-label='No data available']").first()
  ).toBeVisible();
  // The dashboard mounts its supplemental panels via Suspense + idle
  // callback. Wait for those headers so the screenshot captures a
  // fully-laid-out page rather than a transient mid-mount state where
  // page height changes as panels appear.
  await expect(
    page.getByRole("heading", { name: "Risk Signals" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Week Ahead" })
  ).toBeVisible();

  await applyVisualOverrides(page);
}

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
