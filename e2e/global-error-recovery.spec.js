import { test, expect } from "@playwright/test";
import { mockDeniedGeolocation } from "./support/openMeteoMocks";

/*
 * Audit finding 25. The global data-error screen used to replace the whole
 * app with a bare card: no header, no city search, no saved cities. It shows
 * when `error && !hasWeatherData`, and its only action retries the *same*
 * city — so a reader whose city failed persistently had no route to a
 * different one, which is the recovery most likely to work.
 *
 * These drive the real failure rather than mounting the component, because
 * the claim is about what the running app leaves reachable.
 */

async function failTheForecast(page) {
  await page.route("https://api.open-meteo.com/v1/forecast**", (route) =>
    route.fulfill({ status: 500, body: "upstream unavailable" })
  );
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("the global error screen still offers the city search", async ({ page }) => {
  await failTheForecast(page);
  await page.goto("/");

  // The error screen is what we are on, not the dashboard.
  await expect(page.getByRole("alert")).toContainText(
    "We couldn't load weather data"
  );

  // The escape route: the search is present, focusable and typable.
  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await expect(searchInput).toBeVisible();
  await searchInput.click();
  await searchInput.fill("Tokyo");
  await expect(searchInput).toHaveValue("Tokyo");
});

test("the global error screen keeps the retry action working", async ({ page }) => {
  // Adding the header must not cost the action that was already there.
  await failTheForecast(page);
  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "We couldn't load weather data"
  );
  await expect(
    page.getByRole("button", { name: "Reload weather" })
  ).toBeVisible();
});

test("the error card does not overflow the viewport on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await failTheForecast(page);
  await page.goto("/");

  await expect(page.getByRole("alert")).toBeVisible();

  const overflow = await page.evaluate(() => {
    const card = document.querySelector(".error-card");
    const box = card.getBoundingClientRect();
    return {
      right: box.right - document.documentElement.clientWidth,
      left: box.left,
      bodyScrollsSideways:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });

  expect(overflow.left).toBeGreaterThanOrEqual(0);
  expect(overflow.right).toBeLessThanOrEqual(0);
  expect(overflow.bodyScrollsSideways).toBe(false);
});
