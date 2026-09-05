import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";

/**
 * The radar surface, which had no e2e coverage at all -- the largest and
 * most complex feature in the app. `?mock=missing` short-circuits it and the
 * layout specs exclude `.leaflet-container`, so nothing exercised it.
 *
 * RainViewer's catalogue and tiles are stubbed, and so is the CARTO basemap:
 * this container cannot reach either host, and a spec that silently depends
 * on the network is a spec that fails for the wrong reason.
 */

// Fixed rather than derived from the clock so the timeline labels a spec
// asserts on cannot drift with wall time.
const FRAME_EPOCH = 1788000000;
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function stubTiles(page) {
  for (const host of [
    "**/tilecache.rainviewer.com/**",
    "**/basemaps.cartocdn.com/**",
  ]) {
    await page.route(host, (route) =>
      route.fulfill({ contentType: "image/png", body: TRANSPARENT_PNG })
    );
  }
}

async function stubCatalogue(page, body) {
  await page.route("**/api.rainviewer.com/**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
  );
}

function catalogueWithFrames(count = 3) {
  return {
    host: "https://tilecache.rainviewer.com",
    radar: {
      past: Array.from({ length: count }, (_, index) => ({
        time: FRAME_EPOCH - (count - index) * 300,
        path: `/v2/radar/frame-${index}`,
      })),
      nowcast: [],
    },
  };
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await stubTiles(page);
  await page.addInitScript(() => window.localStorage.clear());
});

async function openRadar(page) {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  // The radar slot is lazy: PanelErrorBoundary first renders a placeholder
  // carrying the same class, then swaps in the real panel once the deferred
  // mount fires. An imperative scroll on that locator races the swap
  // ("Element is not attached to the DOM"); expect() re-resolves the locator
  // on every retry, so the assertions below wait for the settled panel.
  return page.locator(".bento-radar").last();
}

test("renders the map and its timeline once frames arrive", async ({ page }) => {
  await stubCatalogue(page, catalogueWithFrames(3));
  const panel = await openRadar(page);

  await expect(panel.locator(".leaflet-container")).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("Tuning in the latest radar")).toHaveCount(0);

  // The scrubber is the part a user drives; without it the map is a picture.
  await expect(panel.locator(".radar-scrubber")).toBeVisible();
  await expect(
    panel.locator(".radar-control:not(.radar-control--play)").first()
  ).toBeVisible();
});

test("says the radar is unavailable rather than showing an empty map", async ({
  page,
}) => {
  // A reachable catalogue carrying no frames. The honest outcome is a stated
  // degraded state -- an empty map would read as "no precipitation", which is
  // the exact claim the data-trust contract forbids the app from inventing.
  await stubCatalogue(page, {
    host: "https://tilecache.rainviewer.com",
    radar: { past: [], nowcast: [] },
  });
  const panel = await openRadar(page);

  await expect(panel.getByText(/no radar frames right now/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.locator(".leaflet-container")).toHaveCount(0);
});

test("offers a retry when the catalogue cannot be reached", async ({ page }) => {
  await page.route("**/api.rainviewer.com/**", (route) => route.abort("failed"));
  const panel = await openRadar(page);

  await expect(panel.getByRole("button", { name: /try again|retry/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.locator(".leaflet-container")).toHaveCount(0);
});

test("states that a clear map may mean no coverage", async ({ page }) => {
  // The caption added for UX-01. It is the only thing standing between an
  // uncovered region and a map that reads as "no rain", and nothing else in
  // the suite would notice its removal.
  await stubCatalogue(page, catalogueWithFrames(2));
  const panel = await openRadar(page);

  await expect(panel.locator(".leaflet-container")).toBeVisible({ timeout: 30_000 });
  await expect(
    panel.getByText(/clear map can also mean no coverage/i)
  ).toBeVisible();
});
