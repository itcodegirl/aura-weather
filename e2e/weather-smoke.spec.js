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

  await expect(page.locator(".hero-location")).toContainText("Palos Hills, United States");
  await expect(
    page.getByText(
      "Palos Hills is loaded as a useful starting point. Use your location for local conditions or search any city when you're ready."
    )
  ).toBeVisible();
  await expect(
    page.getByLabel("Location onboarding").getByRole("button", { name: "Allow location access" })
  ).toBeVisible();
  await expect(page.locator(".location-notice")).toHaveCount(0);
  await expect(page.getByText("Cloud Backup")).toHaveCount(0);
  await expect(
    page.locator(".header-control-label").filter({ hasText: "Climate Context" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear saved location preference" })
  ).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Current Conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near-Term Outlook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atmospheric Conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();
});

test("labels granted browser coordinates as current location", async ({ page }) => {
  await page.addInitScript(() => {
    const grantedGeolocation = {
      getCurrentPosition(success) {
        success({
          coords: {
            latitude: 42.1234,
            longitude: -88.5678,
          },
        });
      },
      watchPosition() {
        return 0;
      },
      clearWatch() {},
    };

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: grantedGeolocation,
    });
  });

  await openDashboard(page);

  await page
    .getByLabel("Location onboarding")
    .getByRole("button", { name: "Allow location access" })
    .click();

  await expect(page.locator(".hero-location")).toContainText("Crystal Lake, United States");
  await expect(
    page.getByText("Showing your device location near Crystal Lake")
  ).toBeVisible();
});

test("renders a cached forecast on cold start when the browser is offline", async ({ page }) => {
  const cachedAt = Date.now();
  await page.addInitScript(({ cachedAtValue }) => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    window.localStorage.setItem(
      "aura-weather-last-known-forecast-v1",
      JSON.stringify({
        version: 1,
        snapshots: {
          "41.6967,-87.8170": {
            version: 1,
            cachedAt: cachedAtValue,
            coordinates: {
              latitude: 41.6967,
              longitude: -87.817,
            },
            weather: {
              meta: {
                latitude: 41.6967,
                longitude: -87.817,
                timezone: "America/Chicago",
              },
              current: {
                temperature: 61.2,
                humidity: 57,
                feelsLike: 61.2,
                conditionCode: 2,
                windSpeed: 8,
                windGust: 13,
                windDirection: 220,
                pressure: 1012,
                dewPoint: 48,
                cloudCover: 35,
                visibility: 11000,
              },
              hourly: {
                time: [],
                temperature: [],
                conditionCode: [],
                rainChance: [],
                rainAmount: [],
                pressure: [],
                cape: [],
                windGust: [],
              },
              daily: {
                time: ["2026-04-21"],
                conditionCode: [2],
                temperatureMax: [67],
                temperatureMin: [51],
                sunrise: ["2026-04-21T11:18:00-05:00"],
                sunset: ["2026-04-21T23:41:00-05:00"],
                uvIndexMax: [6.4],
                rainChanceMax: [20],
                rainAmountTotal: [0.01],
              },
              nowcast: {
                time: [],
                conditionCode: [],
                rainChance: [],
                rainAmount: [],
              },
              aqi: null,
              alerts: [],
              alertsStatus: "idle",
            },
            trustMeta: {
              weatherFetchedAt: cachedAtValue,
              forecastStatus: "ready",
              alertsStatus: "idle",
            },
          },
        },
      })
    );
  }, { cachedAtValue: cachedAt });

  await openDashboard(page);

  await expect(page.locator(".hero-location")).toContainText("Palos Hills, United States");
  await expect(page.locator(".hero-temp")).toContainText("61");
  await expect(
    page.getByText(/Browser is offline\. Showing your most recent saved forecast from/)
  ).toBeVisible();
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
  await expect(page.getByText("Cloud Backup")).toBeVisible();

  // Enter acts only on an option the user actually highlighted. With
  // nothing highlighted it must not commit the first result: the hero
  // stays on the city that is already loaded.
  await searchInput.fill("kyo");
  await expect(page.getByRole("option", { name: /kyoto/i })).toBeVisible();
  await searchInput.press("Enter");
  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");

  // Highlighting first does commit, and selecting leaves focus on the
  // input so the next Tab continues from the search box instead of
  // restarting at the top of the document.
  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expect(page.locator(".hero-location")).toContainText("Kyoto, Japan");
  await expect(searchInput).toBeFocused();
});

test("groups idle suggestions into recent and saved sections", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "aura-weather-recent-cities",
      JSON.stringify([
        {
          lat: 35.6762,
          lon: 139.6503,
          name: "Tokyo",
          country: "Japan",
        },
      ])
    );
    window.localStorage.setItem(
      "aura-weather-saved-cities",
      JSON.stringify([
        {
          lat: 51.5072,
          lon: -0.1276,
          name: "London",
          country: "United Kingdom",
        },
        {
          lat: 35.6762,
          lon: 139.6503,
          name: "Tokyo",
          country: "Japan",
        },
      ])
    );
  });

  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.focus();

  await expect(page.locator(".city-search-group-label", { hasText: "Recent" })).toBeVisible();
  await expect(page.locator(".city-search-group-label", { hasText: "Saved" })).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Tokyo, Recent.*Japan/ })
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: /London, Saved.*United Kingdom/ })
  ).toBeVisible();
});

test("keeps startup city explicit when switching between saved cities", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "aura-weather-last-location",
      JSON.stringify({
        lat: 35.6762,
        lon: 139.6503,
        name: "Tokyo",
        country: "Japan",
        updatedAt: new Date().toISOString(),
      })
    );
    window.localStorage.setItem(
      "aura-weather-saved-cities",
      JSON.stringify([
        {
          lat: 35.6762,
          lon: 139.6503,
          name: "Tokyo",
          country: "Japan",
        },
        {
          lat: 51.5072,
          lon: -0.1276,
          name: "London",
          country: "United Kingdom",
        },
      ])
    );
  });

  await openDashboard(page);

  const tokyoChip = page.locator(".saved-city-chip-wrap").filter({
    has: page.getByRole("button", { name: "Tokyo", exact: true }),
  });
  const londonChip = page.locator(".saved-city-chip-wrap").filter({
    has: page.getByRole("button", { name: "London", exact: true }),
  });

  await expect(tokyoChip.locator(".saved-city-startup-badge")).toBeVisible();
  await page.getByRole("button", { name: "London", exact: true }).click();
  await expect(page.locator(".hero-location")).toContainText("London, United Kingdom");
  await expect(tokyoChip.locator(".saved-city-startup-badge")).toBeVisible();

  await londonChip.getByRole("button", { name: "Make London your startup city" }).click();
  await expect(page.getByText("London is now your startup city.")).toBeVisible();
  await expect(londonChip.locator(".saved-city-startup-badge")).toBeVisible();
  await expect(tokyoChip.locator(".saved-city-startup-badge")).toHaveCount(0);
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

test("keeps the device not-backed-up when starting a backup fails", async ({ page }) => {
  // Fail every Supabase call this flow could make. When the preview build has
  // no Supabase env (the CI case) none of these fire and the service reports
  // "not available in this build" instead — either way the user must end up
  // with a visible error and an un-backed-up device, never a false "Backed up".
  await page.route(/\/auth\/v1\/(signup|token).*/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  );
  await page.route(/\/rest\/v1\/saved_cities.*/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  );

  await openDashboard(page);
  await expect(page.getByText("Cloud Backup")).toHaveCount(0);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");
  await page.getByRole("option", { name: /tokyo/i }).click();

  await page.getByRole("button", { name: /cloud backup/i }).click();
  await page.getByRole("button", { name: "Start backup" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop backup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start backup" })).toBeVisible();

  // And the old paste-a-key affordance is gone for good: an anonymous session
  // cannot be moved to another device, so there is nothing to paste.
  await expect(page.getByLabel("Sync key")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toHaveCount(0);
});

test("removing the active saved city clears its startup persistence", async ({ page }) => {
  await openDashboard(page);

  const searchInput = page.getByRole("combobox", { name: "Search for a city" });
  await searchInput.fill("tok");
  await page.getByRole("option", { name: /tokyo/i }).click();

  await expect(page.locator(".hero-location")).toContainText("Tokyo, Japan");
  await page.getByRole("button", { name: "Remove Tokyo from saved cities" }).click();
  await expect(
    page.getByText("Saved startup location removed. Aura will open to Palos Hills next time.")
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
  await expect(page.getByRole("heading", { name: "Rain Outlook" })).toBeVisible();

  const rainSample = page.locator(".rain-touch-sample").first();
  await expect(rainSample).toBeVisible();
  await rainSample.click();
  await expect(page.locator(".rain-selected-sample")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Hourly Temperature" })).toBeVisible();
  const hourlySample = page.locator(".hourly-touch-sample").first();
  await expect(hourlySample).toBeVisible();
  await hourlySample.click();
  await expect(page.locator(".hourly-selected-sample")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  expect(hasHorizontalOverflow).toBe(false);
});

test("expands a forecast day for richer detail", async ({ page }) => {
  await page.addInitScript(() => {
    const fixedTime = new Date("2026-04-21T12:00:00-05:00").valueOf();
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
  });

  await openDashboard(page);

  // SupplementalWeatherPanels is deferred via useDeferredMount; wait for
  // the "Week Ahead" heading so the ForecastCard has had a chance to mount
  // before we check for the detail-trigger button.
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();

  // The row's accessible name now leads with its readings and ends with the
  // disclosure verb, so anchor on "Today" to pick this row out of the seven.
  const detailTrigger = page.getByRole("button", {
    name: /^today,.*show forecast details$/i,
  });
  if ((await detailTrigger.count()) === 0) {
    await expect(page.getByText("7-day outlook unavailable")).toBeVisible();
    return;
  }
  await detailTrigger.click();

  const detailRegion = page.getByRole("region", {
    name: "Today forecast details",
  });
  await expect(detailRegion).toBeVisible();
  await expect(detailRegion).toContainText("Peak UV");
  await expect(detailRegion).toContainText("Sunrise");
  await expect(detailRegion).toContainText("Sunset");
  await expect(detailRegion).toContainText("SW 14 mph");
});

test("renders the missing-data placeholder when the forecast reports null fields", async ({ page }) => {
  // Override the standard forecast mock with one that returns null for
  // humidity and pressure. The trust contract requires the Atmosphere
  // bento (the new home for these readings since the hero stat grid was
  // removed) to render "—" instead of fake "0%" / "0 hPa" values.
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

  // Humidity + pressure now live in the Atmosphere bento; the missing-
  // data contract (— not fake 0) is enforced on its tiles. Wait for the
  // lazy bento to mount, then assert each tile dashes out honestly.
  await expect(page.locator(".atm-bento")).toBeVisible({ timeout: 20_000 });

  const humidityTile = page
    .locator(".atm-tile", { hasText: "Humidity" })
    .first();
  await expect(humidityTile).toBeVisible();
  await expect(humidityTile).toContainText("—");
  await expect(humidityTile).not.toContainText("0%");
  await expect(humidityTile).toHaveClass(/atm-tile--missing/);

  const pressureTile = page
    .locator(".atm-tile", { hasText: "Pressure" })
    .first();
  await expect(pressureTile).toContainText("—");
  await expect(pressureTile).not.toContainText("0 hPa");
});

test("does not query live providers in the missing-data portfolio demo", async ({ page }) => {
  const providerRequests = [];

  page.on("request", (request) => {
    const url = request.url();
    if (
      url.startsWith("https://api.open-meteo.com/") ||
      url.startsWith("https://archive-api.open-meteo.com/") ||
      url.startsWith("https://air-quality-api.open-meteo.com/") ||
      url.startsWith("https://api.weather.gov/") ||
      url.startsWith("https://api.bigdatacloud.net/") ||
      // Substring checks: RainViewer serves tiles from hosts announced at
      // runtime, CARTO shards basemap tiles across subdomains, and each
      // Supabase project gets its own *.supabase.co subdomain.
      url.includes("rainviewer.com") ||
      url.includes("cartocdn.com") ||
      url.includes(".supabase.co")
    ) {
      providerRequests.push(url);
    }
  });

  await page.goto("/?mock=missing");

  await expect(
    page.getByText("Portfolio demo: showing the missing-data trust contract. Live providers are not queried.")
  ).toBeVisible();
  // The radar slot must hold the honest demo card, not a mounted radar.
  await expect(page.getByText("Radar not queried in this demo")).toBeVisible();
  // Longer than every deferred-mount window (radar 3.2s, rain alerts 4s),
  // so a panel that slipped past the gate would fetch inside this wait.
  await page.waitForTimeout(5000);

  expect(providerRequests).toEqual([]);
});

test("does not leak literal unicode escape sequences into rendered text", async ({ page }) => {
  await openDashboard(page);

  // Wait until supplemental panels (which include the hourly chart axis
  // and AQI/UV cards) have mounted past the deferred-render gate.
  await expect(page.getByRole("heading", { name: "Atmospheric Conditions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Ahead" })).toBeVisible();

  const documentText = await page.evaluate(() => document.body.innerText);
  expect(documentText).not.toMatch(/\\u[0-9a-fA-F]{4}/);
});

test("passes baseline accessibility assertions for the main weather view", async ({ page }) => {
  await openDashboard(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeVisible();

  const report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
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
