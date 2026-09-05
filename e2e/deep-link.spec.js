import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";

/**
 * `?lat&lon` cold start.
 *
 * This path regressed once already and was fixed in aae1318 with nothing
 * locking it. resolveInitialLocationState() is unit tested as a pure
 * function, so what is missing is the integration: that the URL is actually
 * read on a cold load, that it wins over a persisted startup city without
 * overwriting it, and that a malformed link degrades to the default rather
 * than to a broken render.
 */

const TOKYO = { lat: 35.6895, lon: 139.6917, name: "Tokyo", country: "Japan" };
const STARTUP_CITY = {
  lat: 51.5072,
  lon: -0.1276,
  name: "London",
  country: "United Kingdom",
};

function link({ lat, lon, name, country }) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (name) params.set("name", name);
  if (country) params.set("country", country);
  return `/?${params.toString()}`;
}

async function seedStartupCity(page, city) {
  await page.addInitScript((seed) => {
    window.localStorage.setItem(
      "aura-weather-location",
      JSON.stringify({
        lat: seed.lat,
        lon: seed.lon,
        name: seed.name,
        country: seed.country,
      })
    );
  }, city);
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
});

test("opens the city named in a shared link on a cold start", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

  await page.goto(link(TOKYO));
  await expect(page.getByRole("main")).toBeVisible();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
});

test("a shared link wins over the saved startup city without replacing it", async ({
  page,
}) => {
  await seedStartupCity(page, STARTUP_CITY);

  await page.goto(link(TOKYO));
  await expect(page.getByRole("main")).toBeVisible();

  // The link decides what is on screen...
  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");

  // ...but a link someone sent you must not silently re-home the app. The
  // saved city has to survive, or following a link costs you your startup
  // location without ever saying so.
  const persisted = await page.evaluate(() =>
    window.localStorage.getItem("aura-weather-location")
  );
  expect(persisted).toContain("London");
});

test("a link with unusable coordinates falls back instead of rendering broken", async ({
  page,
}) => {
  await page.addInitScript(() => window.localStorage.clear());

  // Out of range rather than merely non-numeric: parseLocationFromUrl range
  // checks are the half a "just parse it" refactor would quietly drop.
  await page.goto("/?lat=999&lon=139.6917&name=Nowhere");
  await expect(page.getByRole("main")).toBeVisible();

  await expect(page.locator(".hero-location")).toContainText(
    "Palos Hills, United States"
  );
  await expect(page.locator(".hero-location")).not.toContainText("Nowhere");
});
