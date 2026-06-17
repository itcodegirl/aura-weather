import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";
import { forceLazyPanelsToPaint } from "./support/visualCapture.js";

/**
 * Captures the dashboard screenshots that the README references for
 * portfolio review. Outputs to docs/screenshots/:
 *
 *   - dashboard-desktop.png        full forecast at 1366×900 with real-data mocks
 *   - dashboard-mobile.png         full forecast at 390×844
 *   - alert-overflow.png           desktop view with 6 NWS alerts so the
 *                                  "+N more alerts" overflow chip is visible
 *
 * The two trust-contract shots (?mock=missing) are captured by the sibling
 * `trust-contract-screenshot.spec.js`. Run both via `npm run screenshots`.
 *
 * Time is frozen to 2026-04-21T12:00:00-05:00 (matches the visual-regression
 * baseline) so generated images stay byte-stable across runs.
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

async function bootstrapDashboard(page, context, viewport) {
  await page.setViewportSize(viewport);
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await freezeTime(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".bento-chart .chart-title")).toBeVisible();
  await expect(page.locator(".bento-storm .storm-title")).toBeVisible();
  await disableMotionAndPinFont(page);
}

function buildAlertFeature(index) {
  const events = [
    "Severe Thunderstorm Warning",
    "Tornado Watch",
    "Flash Flood Warning",
    "High Wind Advisory",
    "Heat Advisory",
    "Dense Fog Advisory",
  ];
  const event = events[index % events.length];
  return {
    type: "Feature",
    properties: {
      id: `nws-alert-${String(index).padStart(3, "0")}`,
      event,
      headline: `${event} issued for Cook County (test feed)`,
      severity: index % 2 === 0 ? "Severe" : "Moderate",
      urgency: "Immediate",
      certainty: "Likely",
      effective: "2026-04-21T16:00:00-05:00",
      expires: "2026-04-21T17:15:00-05:00",
      areaDesc: "Cook County",
      senderName: "NWS Chicago IL",
      description: `Test alert ${index + 1} used to demonstrate the overflow chip.`,
    },
  };
}

test.describe("README dashboard screenshots", () => {
  test("captures the desktop dashboard hero", async ({ page, context }) => {
    await bootstrapDashboard(page, context, { width: 1366, height: 900 });
    await page.screenshot({
      path: "docs/screenshots/dashboard-desktop.png",
      fullPage: true,
    });
  });

  test("captures the mobile stacked dashboard", async ({ page, context }) => {
    await bootstrapDashboard(page, context, { width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/dashboard-mobile.png",
      fullPage: true,
    });
  });

  test("captures the alert-overflow state with 6 active alerts", async ({ page, context }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await mockDeniedGeolocation(context);
    await installOpenMeteoMocks(page);

    // AlertsCard caps the rendered list at 4 alerts and shows a
    // "+N more" overflow chip — feed 6 so the chip is guaranteed visible.
    await page.route("https://api.weather.gov/alerts/active**", async (route) => {
      const features = Array.from({ length: 6 }, (_, index) => buildAlertFeature(index));
      await route.fulfill({
        status: 200,
        contentType: "application/geo+json",
        body: JSON.stringify({ type: "FeatureCollection", features }),
      });
    });

    await freezeTime(page);
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator(".bento-alerts")).toBeVisible();
    await disableMotionAndPinFont(page);

    // Crop to the alerts card so the overflow chip is the focal point.
    const alertsCard = page.locator(".bento-alerts");
    await alertsCard.screenshot({
      path: "docs/screenshots/alert-overflow.png",
    });
  });
});
