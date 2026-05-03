import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks";

async function openDashboard(page) {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
}

test.beforeEach(async ({ page, context }) => {
  await mockDeniedGeolocation(context);
  await installOpenMeteoMocks(page);
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("loads the dashboard with fallback location and core controls", async ({ page }) => {
  await openDashboard(page);

  await expect(page.locator(".hero-location")).toContainText("Chicago, United States");
  await expect(
    page.getByText(
      "Chicago is already loaded as a starting point. Use your browser location for local conditions right now, or search for any city when you want a different view."
    )
  ).toBeVisible();
  await expect(
    page.getByLabel("Location onboarding").getByRole("button", { name: "Allow location access" })
  ).toBeVisible();
  await expect(page.locator(".location-notice")).toHaveCount(0);
  await expect(page.getByText("Cloud Sync")).toBeVisible();
  await expect(
    page.locator(".header-control-label").filter({ hasText: "Climate Context" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear saved location preference" })
  ).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Current Conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near-Term Outlook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risk Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();
});

test("updates hero location when a city is selected from search", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");

  const suggestion = page.getByRole("option", { name: /tokyo/i });
  await expect(suggestion).toBeVisible();
  await suggestion.click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await expect(searchInput).toHaveValue("");
  await expect(page.locator(".location-notice")).toHaveCount(0);
});

test("shows a searching state before empty search results resolve", async ({ page }) => {
  await page.route(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=zur.*/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("zur");

  await expect(page.getByText("Searching locations...")).toBeVisible();
  await expect(page.getByText("No matching cities")).toHaveCount(0);
  await expect(page.getByText("No matching cities")).toBeVisible();
});

test("switches display units without refetching the forecast", async ({ page }) => {
  let forecastRequests = 0;
  let archiveRequests = 0;

  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("https://api.open-meteo.com/v1/forecast")) {
      forecastRequests += 1;
    }
    if (url.startsWith("https://archive-api.open-meteo.com/v1/archive")) {
      archiveRequests += 1;
    }
  });

  await openDashboard(page);

  await expect(page.locator(".hero-temp")).toContainText("67");
  const baselineForecastRequests = forecastRequests;
  const baselineArchiveRequests = archiveRequests;

  expect(baselineForecastRequests).toBeGreaterThan(0);
  expect(baselineArchiveRequests).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Show temperatures in Celsius" }).click();

  await expect(page.locator(".hero-temp")).toContainText("20");
  await expect(
    page.getByRole("button", { name: "Show temperatures in Celsius" })
  ).toHaveAttribute("aria-pressed", "true");

  await page.waitForTimeout(500);

  expect(forecastRequests).toBe(baselineForecastRequests);
  expect(archiveRequests).toBe(baselineArchiveRequests);
});

test("keeps cloud sync disconnected when a manual connect attempt fails", async ({ page }) => {
  await page.route(/https:\/\/jsonblob\.com\/api\/jsonBlob\/broken-sync$/, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Could not load synced locations (503)" }),
    });
  });

  await openDashboard(page);

  await page.getByRole("button", { name: /cloud sync/i }).click();
  await page.getByLabel("Sync key").fill("https://jsonblob.com/api/jsonBlob/broken-sync");
  await page.getByRole("button", { name: "Connect", exact: true }).click();

  await expect(page.getByText("Could not load synced locations (503)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
});

test("removing the active saved city clears its startup persistence", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");
  await page.getByRole("option", { name: /tokyo/i }).click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await page.getByRole("button", { name: "Remove Tokyo from saved cities" }).click();
  await expect(
    page.getByText("Saved startup location removed. Aura will open to Chicago next time.")
  ).toBeVisible();

  const persistedLocation = await page.evaluate(() =>
    window.localStorage.getItem("aura-weather-last-location")
  );

  expect(persistedLocation).toBeNull();
});

test("shows regional alerts fallback for locations outside NWS coverage", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");
  await page.getByRole("option", { name: /tokyo/i }).click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await expect(page.getByText("Alerts unavailable for this region")).toBeVisible();
  await expect(
    page.getByText("Current weather is still live, but NOAA / NWS alert coverage does not extend to this location.")
  ).toBeVisible();
});

test("keeps the mobile dashboard within the viewport width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  await expect(page.getByRole("heading", { name: "Current Conditions" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  expect(hasHorizontalOverflow).toBe(false);
});

test("renders the missing-data placeholder when the forecast reports null fields", async ({ page }) => {
  // Override the standard forecast mock with one that returns null for
  // humidity and pressure. The trust contract requires the hero card
  // to render "—" instead of fake "0%" / "0 hPa" readings.
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        latitude: 41.8781,
        longitude: -87.6298,
        timezone: "America/Chicago",
        current: {
          temperature_2m: 67.4,
          relative_humidity_2m: null,
          apparent_temperature: 68.6,
          weather_code: 2,
          wind_speed_10m: 9.8,
          wind_gusts_10m: 15.4,
          wind_direction_10m: 220,
          surface_pressure: null,
          dew_point_2m: 52.1,
          cloud_cover: 34,
          visibility: 12000,
        },
        hourly: { time: [], temperature_2m: [] },
        daily: {
          time: ["2026-04-21"],
          weather_code: [2],
          temperature_2m_max: [70],
          temperature_2m_min: [55],
          sunrise: ["2026-04-21T11:18:00-05:00"],
          sunset: ["2026-04-21T23:41:00-05:00"],
          uv_index_max: [7],
          precipitation_probability_max: [10],
          precipitation_sum: [0],
        },
        minutely_15: { time: [] },
      }),
    });
  });

  await openDashboard(page);

  const humidityStat = page
    .locator(".hero-stats .stat", { hasText: "Humidity" })
    .first();
  await expect(humidityStat).toBeVisible();
  await expect(humidityStat).toContainText("—");
  await expect(humidityStat).not.toContainText("0%");
  await expect(humidityStat.locator(".stat-value")).toHaveClass(
    /is-missing/
  );

  const pressureStat = page
    .locator(".hero-stats .stat", { hasText: "Pressure" })
    .first();
  await expect(pressureStat).toContainText("—");
  await expect(pressureStat).not.toContainText("0 hPa");
});

test("does not leak literal unicode escape sequences into rendered text", async ({ page }) => {
  await openDashboard(page);

  // Wait until supplemental panels (which include the hourly chart axis
  // and AQI/UV cards) have mounted past the deferred-render gate.
  await expect(page.getByRole("heading", { name: "Risk Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();

  const documentText = await page.evaluate(() => document.body.innerText);
  expect(documentText).not.toMatch(/\\u[0-9a-fA-F]{4}/);
});

test("passes baseline accessibility assertions for the main weather view", async ({ page }) => {
  await openDashboard(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();

  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blockingViolations = report.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );

  expect(
    blockingViolations,
    `Serious a11y issues: ${blockingViolations
      .map((issue) => `${issue.id}: ${issue.help}`)
      .join(" | ")}`
  ).toEqual([]);
});
