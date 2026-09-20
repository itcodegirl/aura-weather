import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks";

test.use({ serviceWorkers: "allow" });

const REQUIRED_APP_SHELL_ASSET_PATTERNS = [
  "^/assets/index-.+\\.js$",
  "^/assets/index-.+\\.css$",
  "^/assets/lucide-.+\\.js$",
  "^/assets/HourlyCard-.+\\.js$",
  "^/assets/HourlyCard-.+\\.css$",
  "^/assets/StormWatch-.+\\.js$",
  "^/assets/StormWatch-.+\\.css$",
  "^/assets/SupplementalWeatherPanels-.+\\.js$",
  "^/assets/SupplementalWeatherPanels-.+\\.css$",
];

async function resetServiceWorkerState(context, page) {
  const cleanupPath = "/__aura-sw-cleanup__";
  await page.route(`**${cleanupPath}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Aura service worker cleanup</title>",
    });
  });

  await page.goto(cleanupPath);
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  });
  await page.unroute(`**${cleanupPath}`);
  await page.close();
  return context.newPage();
}

async function waitForActiveServiceWorker(page) {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) {
        return false;
      }

      await navigator.serviceWorker.ready;
      return Boolean(navigator.serviceWorker.controller);
    },
    null,
    { timeout: 20_000 }
  );
}

async function waitForCachedAppShellAssets(page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async (requiredAssetPatterns) => {
          const cacheNames = await caches.keys();
          const appShellCacheName = cacheNames.find((cacheName) =>
            cacheName.endsWith("-app-shell")
          );

          if (!appShellCacheName) {
            return requiredAssetPatterns;
          }

          const cache = await caches.open(appShellCacheName);
          const cachedPaths = (await cache.keys()).map(
            (request) => new URL(request.url).pathname
          );

          return requiredAssetPatterns.filter((pattern) => {
            const expression = new RegExp(pattern);
            return !cachedPaths.some((path) => expression.test(path));
          });
        }, REQUIRED_APP_SHELL_ASSET_PATTERNS),
      {
        message: "production app shell assets are cached",
        timeout: 15_000,
      }
    )
    .toEqual([]);
}

test.beforeEach(async ({ context }) => {
  await mockDeniedGeolocation(context);
  await context.addInitScript(() => {
    // Clear once per tab rather than on every navigation. An init script
    // runs again on reload, and the offline-restore test below reloads on
    // purpose: it has to find the snapshot the first load wrote. Clearing
    // there would delete the very thing under test and the assertion would
    // pass or fail for the wrong reason. sessionStorage is per tab and
    // resetServiceWorkerState() hands back a fresh one, so each test still
    // starts clean.
    try {
      if (!window.sessionStorage.getItem("__aura_e2e_storage_cleared__")) {
        window.localStorage.clear();
        window.sessionStorage.setItem("__aura_e2e_storage_cleared__", "1");
      }
    } catch {
      window.localStorage.clear();
    }
    window.__AURA_SW_REGISTRATION_DELAY_MS__ = 0;
  });
});

test("serves the app shell after a production load goes offline", async ({
  context,
  page,
}) => {
  test.setTimeout(75_000);
  page = await resetServiceWorkerState(context, page);
  await page.goto("/?mock=missing");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator(".hero-location")).toContainText("Sample City");
  await expect(
    page.getByText("Portfolio demo: showing the missing-data trust contract")
  ).toBeVisible();

  await waitForActiveServiceWorker(page);
  await waitForCachedAppShellAssets(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "load" });

    await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".hero-location")).toContainText("Sample City");
    await expect(
      page.getByText("Portfolio demo: showing the missing-data trust contract")
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

/*
 * The offline labels themselves, on the route that actually has them.
 *
 * The shell test above reloads `/?mock=missing`, which is the right route
 * for asserting the shell survives -- but that route replaces the whole
 * weather view model, so useWeatherData never runs and none of the
 * offline/cached/stale surfaces can appear on it at all. The one spec that
 * does assert the banner (weather-smoke) fakes offline with an init script,
 * hand-seeds the snapshot, and runs with service workers blocked, so it
 * never exercises an app-written snapshot restored under an SW-served shell.
 *
 * Between them, every offline and cached label in the product could have
 * been deleted and `npm run test:e2e` would have stayed green. This closes
 * that: a real load that writes its own snapshot, a real offline reload,
 * and an assertion on each of the three carriers a user can actually see.
 */
test("labels a restored forecast as saved after a real offline reload", async ({
  context,
  page,
}) => {
  test.setTimeout(75_000);
  page = await resetServiceWorkerState(context, page);
  await installOpenMeteoMocks(page);

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  // The app has to have answered and written its own snapshot before the
  // reload, so wait for the live state rather than a fixed delay.
  await expect(page.locator(".global-update-indicator--live")).toBeVisible({
    timeout: 30_000,
  });

  await waitForActiveServiceWorker(page);
  await waitForCachedAppShellAssets(page);

  // Drop the route mocks BEFORE going offline. Playwright fulfils routed
  // requests without touching the network stack, so leaving them installed
  // serves a full forecast to a supposedly offline page and it renders
  // "live" -- a harness artifact that reads exactly like the app failing to
  // label a restore. Nothing cached can reach the app for real: public/sw.js
  // only caches same-origin requests, and the providers are cross-origin.
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "load" });

    await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/Showing your most recent saved forecast/)
    ).toBeVisible();
    await expect(page.locator(".global-update-indicator--saved")).toHaveCount(1);
    await expect(page.locator(".hero-trust-pill--saved")).toBeVisible();
    // The restore must never be dressed as a current reading.
    await expect(page.locator(".global-update-indicator--live")).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});
