import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";

/**
 * The "App update ready → Refresh" flow. This was completely broken until
 * c533af2 and had no test guarding it since.
 *
 * Playwright blocks real service workers here (playwright.config.js), and a
 * two-build harness is more machinery than the contract needs. Instead the
 * browser API is stubbed at init: `navigator.serviceWorker.register()` hands
 * back a registration that already has a waiting worker and an active
 * controller -- the exact shape the watcher treats as "update ready". The
 * hook, the banner, and the activate path are all the real code.
 */

async function installUpdateReadyServiceWorker(page) {
  await page.addInitScript(() => {
    window.__swMessages = [];
    // Skip the production registration delay (8s) -- the override slot exists
    // for exactly this.
    window.__AURA_SW_REGISTRATION_DELAY_MS__ = 0;

    const noop = () => {};
    const waitingWorker = {
      state: "installed",
      postMessage: (message) => window.__swMessages.push(message),
      addEventListener: noop,
      removeEventListener: noop,
    };
    const registration = {
      waiting: waitingWorker,
      installing: null,
      active: { state: "activated", postMessage: noop },
      addEventListener: noop,
      removeEventListener: noop,
      update: async () => registration,
    };
    const fakeServiceWorker = {
      controller: { state: "activated" },
      register: async () => registration,
      getRegistration: async () => registration,
      ready: Promise.resolve(registration),
      addEventListener: noop,
      removeEventListener: noop,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: fakeServiceWorker,
      configurable: true,
    });
    // The activate path schedules a reload 4s after posting SKIP_WAITING as a
    // fallback if controllerchange never fires. Under the stub it never does,
    // so neutralise the reload rather than let it tear down the page while
    // an assertion is still reading it.
    window.location.reload = () => {
      window.__reloadRequested = true;
    };
  });
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await page.addInitScript(() => window.localStorage.clear());
});

test("announces a waiting update and activates it on Refresh", async ({ page }) => {
  await installUpdateReadyServiceWorker(page);
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();

  const banner = page.getByRole("status").filter({ hasText: "App update ready." });
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await banner.getByRole("button", { name: "Refresh" }).click();

  // The contract is the message to the waiting worker. Without it the new
  // build sits installed-but-inactive forever, which is exactly what c533af2
  // fixed.
  await expect
    .poll(() => page.evaluate(() => window.__swMessages))
    .toEqual([{ type: "SKIP_WAITING" }]);
  await expect(banner.getByRole("button", { name: "Refreshing..." })).toBeDisabled();
});

test("Later dismisses the update without activating it", async ({ page }) => {
  await installUpdateReadyServiceWorker(page);
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();

  const banner = page.getByRole("status").filter({ hasText: "App update ready." });
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await banner.getByRole("button", { name: "Later" }).click();

  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => window.__swMessages)).toEqual([]);
});

test("shows no update banner when nothing is waiting", async ({ page }) => {
  // Same stub, no waiting worker: the banner must not appear on the strength
  // of a registration alone.
  await page.addInitScript(() => {
    window.__AURA_SW_REGISTRATION_DELAY_MS__ = 0;
    const noop = () => {};
    const registration = {
      waiting: null,
      installing: null,
      active: { state: "activated" },
      addEventListener: noop,
      removeEventListener: noop,
      update: async () => registration,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        controller: { state: "activated" },
        register: async () => registration,
        getRegistration: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener: noop,
        removeEventListener: noop,
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();

  // Give the registration watcher longer than it could possibly need, then
  // assert absence. A too-short wait here would pass vacuously.
  await page.waitForTimeout(2000);
  await expect(page.getByText("App update ready.")).toHaveCount(0);
});
