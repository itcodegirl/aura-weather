import { Buffer } from "node:buffer";
import { expect } from "@playwright/test";
import { installOpenMeteoMocks, mockDeniedGeolocation } from "./openMeteoMocks.js";

const FIXED_TIMESTAMP_ISO = "2026-04-21T12:00:00-05:00";

// A 256x256 fully transparent PNG. Radar tiles are the only imagery in these
// captures that changes with the real weather; serving a fixed tile keeps the
// map itself (basemap, controls, legend, timeline) in the picture while making
// the overlay reproducible.
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAADFJREFUeNrtwQENAAAAwqD3T20ON6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA3TAAAAdW1S9EAAAAASUVORK5CYII=",
  "base64"
);

// Frames are dated from the same frozen clock the rest of the capture uses.
// Pinning them to an unrelated epoch made the radar timeline honestly report
// "131600m ago" in the README screenshot.
const RADAR_FRAME_EPOCH = Math.floor(
  new Date(FIXED_TIMESTAMP_ISO).valueOf() / 1000
);

/**
 * The radar card fetches its frame catalogue from RainViewer and its tiles
 * from a CDN. Live weather made these captures nondeterministic in two ways:
 * the tile imagery changed, and — worse — the card's height changed depending
 * on whether the frames had arrived, swinging the full-page screenshot by more
 * than 100px between runs of identical code.
 *
 * The waits below are what make a capture reproducible. They were written
 * when screenshot comparison still gated CI; that gate is gone, but the
 * docs images are still captured here and a half-loaded radar card would
 * swing their height, so the waits stay.
 */
export async function mockRadar(page) {
  await page.route("https://api.rainviewer.com/public/weather-maps.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: "2.0",
        host: "https://tilecache.rainviewer.com",
        radar: {
          // Observed frames only. No nowcast, so the timeline renders its
          // honest "no forecast frames available" line rather than inventing
          // a forecast loop.
          past: [-1200, -600, 0].map((offset) => ({
            time: RADAR_FRAME_EPOCH + offset,
            path: `/v2/radar/${RADAR_FRAME_EPOCH + offset}`,
          })),
          nowcast: [],
        },
      }),
    })
  );

  await page.route("https://tilecache.rainviewer.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: BLANK_TILE })
  );
}

/**
 * The radar card settles into a map; wait for it before capturing.
 *
 * Tiles are also waited on. The basemap is left live because those tiles are
 * static for a fixed centre and zoom — but a tile still in flight paints as
 * blank, which is how ~14k pixels of the mobile dashboard kept moving between
 * runs while staying just inside the tolerance.
 */
async function waitForRadar(page) {
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByText("Tuning in the latest radar")).toHaveCount(0);
  await page.waitForFunction(() => {
    const tiles = document.querySelectorAll(".leaflet-tile");
    if (tiles.length === 0) return false;
    return [...tiles].every((tile) => tile.classList.contains("leaflet-tile-loaded"));
  });
}

/**
 * One bootstrap for every image this repo captures.
 *
 * Capture paths used to bootstrap the page separately, and only one of them
 * grew the waits that make a capture reproducible, so the docs screenshots
 * silently drifted: with identical application code, trust-contract-mobile.png
 * came out 390x1290 in one CI run and 390x1936 in another, because
 * `fullPage: true` fired while the lazily-mounted panels were still arriving
 * and the page was still growing.
 *
 * Everything that captures an image now shares these helpers, so no screenshot
 * can be taken of a half-mounted page.
 */



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
 * page keeps growing after `main` becomes visible.
 *
 * Waiting for the section HEADINGS is not enough, and quietly was not: the
 * headings live in SupplementalWeatherPanels' static markup, while the cards
 * beneath them are lazy chunks (lazyPanels.js). A capture could satisfy both
 * heading waits and still photograph an empty "Atmospheric Conditions" section
 * — which is exactly what happened once the bento grew eight help drawers and
 * its chunk took a moment longer to arrive. The dashboard screenshot came out
 * 749px shorter with the bento simply absent.
 *
 * So wait for the CONTENT of the last panels to exist, not their labels.
 */
async function waitForSupplementalPanels(page) {
  await expect(
    page.getByRole("heading", { name: "Atmospheric Conditions" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();

  // The bento's own tiles, not the heading above them.
  await expect(page.locator(".bento-atm .atm-tile").first()).toBeVisible();
  await page.waitForFunction(
    () => document.querySelectorAll(".bento-atm .atm-tile").length === 8
  );
  await expect(page.locator(".bento-forecast").first()).toBeVisible();
}

export async function bootstrapVisualState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await mockRadar(page);
  await installFixedClock(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".bento-chart .chart-title")).toBeVisible();
  await expect(page.locator(".bento-storm .storm-title")).toBeVisible();
  await waitForSupplementalPanels(page);
  await waitForRadar(page);

  await applyVisualOverrides(page);
}

export async function bootstrapMissingMockState(page, context, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // ?mock=missing short-circuits all real fetches, but denying geolocation
  // keeps the visual identical between local + CI runs in case any other
  // permission prompt nudges layout.
  await mockDeniedGeolocation(context);
  await mockRadar(page);
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
  await waitForRadar(page);

  await applyVisualOverrides(page);
}
