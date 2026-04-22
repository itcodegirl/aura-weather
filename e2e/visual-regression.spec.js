import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks";

const SNAPSHOT_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 900, height: 1200 },
  { name: "mobile", width: 390, height: 844 },
];

const FIXED_TIMESTAMP_ISO = "2026-04-21T12:00:00-05:00";

async function bootstrapVisualState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);

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

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();

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

for (const viewport of SNAPSHOT_VIEWPORTS) {
  test(`matches dashboard visuals at ${viewport.name}`, async ({ page, context }) => {
    await bootstrapVisualState(page, context, viewport);

    await expect(page.locator(".app-inner")).toHaveScreenshot(
      `dashboard-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      }
    );
  });
}
