function toIsoMinute(date) {
  return date.toISOString().slice(0, 16);
}

function toDateAtOffset(baseDate, minutesOffset) {
  return new Date(baseDate.getTime() + minutesOffset * 60_000);
}

function buildWeatherPayload(latitude, longitude) {
  const now = new Date();
  now.setSeconds(0, 0);
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  const dailyStart = new Date(now);
  dailyStart.setHours(0, 0, 0, 0);

  const hourlySize = 72;
  const hourlyStartMinutes = -24 * 60;
  const hourlyTime = Array.from({ length: hourlySize }, (_, index) =>
    toIsoMinute(toDateAtOffset(currentHour, hourlyStartMinutes + index * 60))
  );
  const hourlyTemperature = Array.from({ length: hourlySize }, (_, index) => {
    const radians = (index / 24) * Math.PI * 2;
    return Number((62 + Math.sin(radians) * 8).toFixed(1));
  });
  const hourlyCode = Array.from({ length: hourlySize }, (_, index) =>
    index % 9 === 0 ? 61 : 2
  );
  const hourlyRainChance = Array.from({ length: hourlySize }, (_, index) =>
    Math.round(Math.max(0, Math.sin((index - 18) / 6) * 45 + 30))
  );
  const hourlyRainAmount = hourlyRainChance.map((chance) =>
    Number((chance >= 45 ? (chance - 35) / 110 : 0).toFixed(2))
  );
  const hourlyPressure = Array.from({ length: hourlySize }, (_, index) =>
    Number((1012 + Math.sin(index / 8) * 4).toFixed(1))
  );
  const hourlyCape = Array.from({ length: hourlySize }, (_, index) =>
    Math.max(0, Math.round(Math.sin(index / 7) * 180 + 220))
  );
  const hourlyWindGust = Array.from({ length: hourlySize }, (_, index) =>
    Number((12 + Math.sin(index / 9) * 6).toFixed(1))
  );

  const dailySize = 7;
  const dailyTime = Array.from({ length: dailySize }, (_, index) => {
    const date = new Date(dailyStart);
    date.setDate(dailyStart.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const dailyTemperatureMax = [68, 70, 72, 69, 66, 67, 71];
  const dailyTemperatureMin = [55, 56, 58, 57, 53, 54, 56];
  const dailySunrise = Array.from({ length: dailySize }, (_, index) => {
    const date = new Date(dailyStart);
    date.setDate(dailyStart.getDate() + index);
    date.setHours(11, 18, 0, 0);
    return date.toISOString();
  });
  const dailySunset = Array.from({ length: dailySize }, (_, index) => {
    const date = new Date(dailyStart);
    date.setDate(dailyStart.getDate() + index);
    date.setHours(23, 41, 0, 0);
    return date.toISOString();
  });

  const nowcastSize = 12;
  const nowcastTime = Array.from({ length: nowcastSize }, (_, index) =>
    toIsoMinute(toDateAtOffset(now, index * 15))
  );
  const nowcastRainChance = [8, 14, 18, 26, 34, 48, 62, 52, 44, 28, 18, 10];
  const nowcastRainAmount = [0, 0, 0, 0.01, 0.03, 0.08, 0.13, 0.1, 0.06, 0.02, 0, 0];
  const nowcastCode = [1, 1, 2, 51, 61, 61, 63, 61, 51, 2, 1, 1];

  return {
    latitude,
    longitude,
    timezone: "America/Chicago",
    current: {
      temperature_2m: 67.4,
      relative_humidity_2m: 58,
      apparent_temperature: 68.6,
      weather_code: 2,
      wind_speed_10m: 9.8,
      wind_gusts_10m: 15.4,
      wind_direction_10m: 220,
      surface_pressure: 1014.2,
      dew_point_2m: 52.1,
      cloud_cover: 34,
      visibility: 12000,
    },
    hourly: {
      time: hourlyTime,
      temperature_2m: hourlyTemperature,
      weather_code: hourlyCode,
      precipitation_probability: hourlyRainChance,
      precipitation: hourlyRainAmount,
      surface_pressure: hourlyPressure,
      cape: hourlyCape,
      wind_gusts_10m: hourlyWindGust,
    },
    daily: {
      time: dailyTime,
      weather_code: [2, 3, 61, 3, 2, 2, 1],
      temperature_2m_max: dailyTemperatureMax,
      temperature_2m_min: dailyTemperatureMin,
      sunrise: dailySunrise,
      sunset: dailySunset,
      uv_index_max: [7.2, 6.8, 7.4, 6.2, 5.9, 6.1, 7.0],
      precipitation_probability_max: [22, 30, 68, 44, 20, 18, 28],
      precipitation_sum: [0.02, 0.04, 0.31, 0.12, 0.01, 0.0, 0.05],
    },
    minutely_15: {
      time: nowcastTime,
      weather_code: nowcastCode,
      precipitation_probability: nowcastRainChance,
      precipitation: nowcastRainAmount,
    },
  };
}

function buildArchivePayload() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const currentYear = now.getUTCFullYear();
  const years = [currentYear - 1, currentYear - 2, currentYear - 3];
  const times = years.map((year) => `${year}-${month}-${day}`);

  return {
    daily: {
      time: times,
      temperature_2m_mean: [64.8, 65.2, 63.9],
      temperature_2m_min: [54.7, 55.1, 53.8],
      temperature_2m_max: [73.2, 74.0, 72.4],
    },
  };
}

export async function installOpenMeteoMocks(page) {
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const latitude = Number(requestUrl.searchParams.get("latitude"));
    const longitude = Number(requestUrl.searchParams.get("longitude"));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildWeatherPayload(
          Number.isFinite(latitude) ? latitude : 41.8781,
          Number.isFinite(longitude) ? longitude : -87.6298
        )
      ),
    });
  });

  await page.route("https://air-quality-api.open-meteo.com/v1/air-quality**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: {
          european_aqi: 42,
        },
      }),
    });
  });

  await page.route("https://archive-api.open-meteo.com/v1/archive**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildArchivePayload()),
    });
  });

  await page.route("https://api.weather.gov/alerts/active**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const [latitudeValue, longitudeValue] = String(
      requestUrl.searchParams.get("point") || ""
    )
      .split(",")
      .map((value) => Number(value));
    const hasUsCoverage =
      Number.isFinite(latitudeValue) &&
      Number.isFinite(longitudeValue) &&
      latitudeValue >= 18 &&
      latitudeValue <= 72 &&
      longitudeValue >= -179 &&
      longitudeValue <= -60;

    if (!hasUsCoverage) {
      await route.fulfill({
        status: 400,
        contentType: "application/geo+json",
        body: JSON.stringify({
          title: "Unsupported point",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/geo+json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              id: "nws-alert-001",
              event: "Severe Thunderstorm Warning",
              headline: "Severe Thunderstorm Warning issued for Cook County",
              severity: "Severe",
              urgency: "Immediate",
              certainty: "Likely",
              effective: "2026-04-21T16:00:00-05:00",
              expires: "2026-04-21T17:15:00-05:00",
              areaDesc: "Cook County",
              senderName: "NWS Chicago IL",
              description: "Damaging wind gusts are possible with this storm.",
            },
          },
        ],
      }),
    });
  });

  await page.route("https://geocoding-api.open-meteo.com/v1/search**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = (requestUrl.searchParams.get("name") || "").toLowerCase();

    let results = [];
    if (query.includes("tok")) {
      results = [
        {
          id: 1850147,
          name: "Tokyo",
          latitude: 35.6762,
          longitude: 139.6503,
          country: "Japan",
          admin1: "Tokyo",
        },
      ];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results }),
    });
  });
}

export async function mockDeniedGeolocation(context) {
  await context.addInitScript(() => {
    const deniedGeolocation = {
      getCurrentPosition(_success, error) {
        if (typeof error === "function") {
          error({
            code: 1,
            message: "Permission denied",
          });
        }
      },
      watchPosition() {
        return 0;
      },
      clearWatch() {},
    };

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: deniedGeolocation,
    });
  });
}
