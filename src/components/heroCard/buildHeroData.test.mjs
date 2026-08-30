import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildHeroData } from "./buildHeroData.js";

const baseLocation = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Chicago",
  country: "United States",
};

const baseWeather = {
  current: {
    temperature: 67.4,
    humidity: 58,
    feelsLike: 68,
    conditionCode: 2,
    windSpeed: 9.8,
    windGust: 14.2,
    windDirection: 220,
    pressure: 1014,
    dewPoint: 52,
    cloudCover: 34,
    visibility: 12000,
  },
  daily: {
    temperatureMax: [70],
    temperatureMin: [55],
    sunrise: ["2026-04-21T06:18:00-05:00"],
    sunset: ["2026-04-21T19:41:00-05:00"],
    uvIndexMax: [7.2],
    rainChanceMax: [22],
    rainAmountTotal: [0.02],
  },
};

describe("buildHeroData", () => {
  test("returns null when weather is missing", () => {
    assert.equal(
      buildHeroData({ weather: null, location: baseLocation, unit: "F" }),
      null
    );
    assert.equal(
      buildHeroData({ weather: {}, location: baseLocation, unit: "F" }),
      null
    );
  });

  test("returns null when location is missing", () => {
    assert.equal(
      buildHeroData({ weather: baseWeather, location: null, unit: "F" }),
      null
    );
  });

  test("formats real readings with unit suffixes", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.currentTempDisplay, "67");
    assert.equal(data.feelsLikeDisplay, "68°F");
    assert.equal(data.dewPointDisplay, "52°F");
    assert.equal(data.todayHighDisplay, "70°F");
    assert.equal(data.todayLowDisplay, "55°F");
    assert.equal(data.humidityDisplay, "58%");
    assert.equal(data.pressureDisplay, "1014 hPa");
    assert.equal(data.tempUnit, "°F");
    assert.equal(data.isCurrentTempMissing, false);
    assert.equal(data.heroStatsHaveAnyMissing, false);
  });

  test("renders the today label in the forecast's timezone, not the device's", () => {
    // 2026-04-21 23:00 UTC is 2026-04-22 08:00 in Tokyo (UTC+9) and
    // 2026-04-21 18:00 in Chicago (UTC-5). With Tokyo's tz, the label
    // should read Wednesday; with Chicago's, Tuesday.
    const ts = Date.UTC(2026, 3, 21, 23, 0, 0);
    const tokyoWeather = {
      ...baseWeather,
      meta: { timezone: "Asia/Tokyo" },
    };
    const chicagoWeather = {
      ...baseWeather,
      meta: { timezone: "America/Chicago" },
    };
    const tokyo = buildHeroData({
      weather: tokyoWeather,
      location: baseLocation,
      unit: "F",
      nowMs: ts,
    });
    const chicago = buildHeroData({
      weather: chicagoWeather,
      location: baseLocation,
      unit: "F",
      nowMs: ts,
    });
    assert.match(tokyo.today, /Wednesday/);
    assert.match(chicago.today, /Tuesday/);
  });

  test("derives the today label from the supplied nowMs so midnight rollover refreshes", () => {
    // 2026-04-20 23:50 UTC and 2026-04-21 00:10 UTC straddle midnight
    // depending on TZ, so use noon in two different days to keep the
    // assertion timezone-independent.
    const dayOne = Date.UTC(2026, 3, 20, 18, 0, 0);
    const dayTwo = Date.UTC(2026, 3, 21, 18, 0, 0);

    const monday = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      nowMs: dayOne,
    });
    const tuesday = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      nowMs: dayTwo,
    });

    assert.notEqual(monday.today, tuesday.today);
  });

  test("builds practical daily guidance from forecast readings", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: {
          ...baseWeather.current,
          windGust: 34,
        },
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [68],
          rainAmountTotal: [0.18],
          uvIndexMax: [8.4],
        },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.dailyGuidance.length, 3);
    assert.deepEqual(
      data.dailyGuidance.map((item) => item.value),
      ["Bring rain gear", "Very high exposure", "Gusty conditions"]
    );
  });

  test("hides calm-tone guidance pills so non-events do not narrate", () => {
    // Mild, dry, low-UV, low-wind day — every guidance item resolves
    // to "calm". The hero should render no guidance pills at all.
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: {
          ...baseWeather.current,
          windSpeed: 4,
          windGust: 6,
        },
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [3],
          rainAmountTotal: [0],
          uvIndexMax: [1.2],
        },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.dailyGuidance.length, 0);
  });

  test("retains a mix of notice + calm by hiding only the calm ones", () => {
    // Rain is "watch" (>=55%), UV is calm (<3), wind is calm (<18).
    // Only the rain guidance should make it through the filter.
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: {
          ...baseWeather.current,
          windSpeed: 4,
          windGust: 6,
        },
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [70],
          rainAmountTotal: [0.4],
          uvIndexMax: [1.5],
        },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.dailyGuidance.length, 1);
    assert.equal(data.dailyGuidance[0].kind, "rain");
  });

  test("renders the rain-guidance amount in the display unit (mm for °C)", () => {
    // Chance missing forces the amount-based detail line. The wire
    // amount is inches (0.18 in = 4.57 mm); a °C user must see mm.
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [null],
          rainAmountTotal: [0.18],
        },
      },
      location: baseLocation,
      unit: "C",
    });

    const rain = data.dailyGuidance.find((item) => item.kind === "rain");
    assert.equal(rain.detail, "4.57 mm expected today");
  });

  test("keeps the rain-guidance amount in inches for °F users", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [null],
          rainAmountTotal: [0.18],
        },
      },
      location: baseLocation,
      unit: "F",
    });

    const rain = data.dailyGuidance.find((item) => item.kind === "rain");
    assert.equal(rain.detail, "0.18 in expected today");
  });

  test("marks daily guidance unavailable instead of inventing readings", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: {
          ...baseWeather.current,
          windSpeed: null,
          windGust: null,
        },
        daily: {
          ...baseWeather.daily,
          rainChanceMax: [null],
          rainAmountTotal: [null],
          uvIndexMax: [null],
        },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.deepEqual(
      data.dailyGuidance.map((item) => item.tone),
      ["unavailable", "unavailable", "unavailable"]
    );
  });

  test("converts to Celsius on demand", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "C",
    });

    assert.equal(data.currentTempDisplay, "20");
    assert.equal(data.feelsLikeDisplay, "20°C");
    assert.equal(data.tempUnit, "°C");
  });

  test("classifies comfort and wind chips against source °F/mph regardless of display unit", () => {
    // dewPoint and windSpeed are always sourced in °F/mph; the comfort/wind labels must
    // not shift with the display unit. Regression guard for the double-conversion that
    // mislabeled a dry 52°F dew point as "Muggy" and a 30 mph "Gusty" wind as "Breezy"
    // for °C users.
    const weather = {
      ...baseWeather,
      current: { ...baseWeather.current, dewPoint: 52, windSpeed: 30 },
    };
    const labelFor = (data, id) =>
      data.characteristicChips.find((chip) => chip.id === id)?.label;

    const fahrenheit = buildHeroData({ weather, location: baseLocation, unit: "F" });
    const celsius = buildHeroData({ weather, location: baseLocation, unit: "C" });

    assert.equal(labelFor(fahrenheit, "comfort"), "Comfortable");
    assert.equal(labelFor(celsius, "comfort"), "Comfortable");
    assert.equal(labelFor(fahrenheit, "wind"), "Gusty");
    assert.equal(labelFor(celsius, "wind"), "Gusty");
  });

  test("renders missing placeholders without misleading unit suffixes", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: {
          ...baseWeather.current,
          temperature: null,
          humidity: null,
          pressure: null,
          dewPoint: null,
          feelsLike: null,
        },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.currentTempDisplay, "—");
    assert.equal(data.isCurrentTempMissing, true);
    assert.equal(data.feelsLikeDisplay, "—");
    assert.equal(data.dewPointDisplay, "—");
    assert.equal(data.humidityDisplay, "—");
    assert.equal(data.pressureDisplay, "—");
    assert.equal(data.heroStatsHaveAnyMissing, true);
  });

  test("falls back to 'Current location' when location.name is empty", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: { ...baseLocation, name: "  " },
      unit: "F",
    });
    assert.equal(data.safeLocationName, "Current location");
  });

  test("trims location.name and country whitespace", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: { ...baseLocation, name: "  Chicago  ", country: "  USA " },
      unit: "F",
    });
    assert.equal(data.safeLocationName, "Chicago");
    assert.equal(data.safeLocationCountry, "United States");
  });

  test("uses display country names instead of raw official provider labels", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: {
        ...baseLocation,
        name: "Township of Palos",
        country: "United States of America (the)",
      },
      unit: "F",
    });

    assert.equal(data.safeLocationCountry, "United States");
  });

  test("builds a 'warmer than average' climate message in Fahrenheit", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      climateComparison: {
        difference: 12.7,
        sampleYears: 30,
        referenceDateLabel: "April 21",
      },
    });
    assert.equal(data.hasClimateComparison, true);
    assert.match(data.climateMessage, /^Today is 13°F warmer than the 30-year/);
    assert.match(data.climateMessage, /Chicago/);
  });

  test("builds a 'colder than average' climate message in Celsius", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "C",
      climateComparison: {
        difference: -9, // 9°F colder ≈ 5°C colder
        sampleYears: 25,
        referenceDateLabel: "April 21",
      },
    });
    assert.equal(data.hasClimateComparison, true);
    assert.match(data.climateMessage, /^Today is 5°C colder than the 25-year/);
  });

  test("falls back to 30-year wording when sampleYears is missing", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      climateComparison: {
        difference: 7,
        // sampleYears intentionally omitted
        referenceDateLabel: "April 21",
      },
    });
    assert.match(data.climateMessage, /30-year/);
  });

  test("rejects climate comparison when difference is null/non-finite", () => {
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      climateComparison: { difference: null, sampleYears: 30 },
    });
    assert.equal(data.hasClimateComparison, false);
    assert.equal(data.climateMessage, "");
  });

  test("hides the climate line when the delta is small (statistical noise)", () => {
    const small = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      climateComparison: { difference: 2, sampleYears: 30 },
    });
    assert.equal(small.hasClimateComparison, false);
    assert.equal(small.climateMessage, "");

    const negativeSmall = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
      climateComparison: { difference: -3, sampleYears: 30 },
    });
    assert.equal(negativeSmall.hasClimateComparison, false);
  });

  test("flags any missing hero stat via heroStatsHaveAnyMissing", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: { ...baseWeather.current, dewPoint: null },
      },
      location: baseLocation,
      unit: "F",
    });
    assert.equal(data.heroStatsHaveAnyMissing, true);
    assert.equal(data.dewPointDisplay, "—");
  });

  test("builds a UV panel from the daily peak with level, copy, and marker", () => {
    // baseWeather daily.uvIndexMax = [7.2] → High band (6–7.99).
    const data = buildHeroData({
      weather: baseWeather,
      location: baseLocation,
      unit: "F",
    });

    assert.ok(data.uvPanel, "uvPanel present when uvIndexMax exists");
    assert.equal(data.uvPanel.peak, 7.2);
    assert.equal(data.uvPanel.peakLabel, "Peak UV 7.2");
    assert.equal(data.uvPanel.level, "High");
    assert.equal(data.uvPanel.head, "Use sun protection");
    assert.ok(data.uvPanel.sub.startsWith("Peak UV 7.2 —"));
    assert.ok(Math.abs(data.uvPanel.markerPct - (7.2 / 11) * 100) < 1e-9);
  });

  test("drops the UV panel entirely when the daily peak is missing", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        daily: { ...baseWeather.daily, uvIndexMax: [null] },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.uvPanel, null);
  });

  test("labels UV bands across the 0–11+ scale", () => {
    const level = (uv) =>
      buildHeroData({
        weather: {
          ...baseWeather,
          daily: { ...baseWeather.daily, uvIndexMax: [uv] },
        },
        location: baseLocation,
        unit: "F",
      }).uvPanel.level;

    assert.equal(level(1), "Low");
    assert.equal(level(4), "Moderate");
    assert.equal(level(7), "High");
    assert.equal(level(9), "Very high");
    assert.equal(level(11.5), "Extreme");
  });

  test("clamps the UV marker to 100% past the top of the scale", () => {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        daily: { ...baseWeather.daily, uvIndexMax: [13] },
      },
      location: baseLocation,
      unit: "F",
    });

    assert.equal(data.uvPanel.markerPct, 100);
  });
});

describe("wind guidance never invents a reading", () => {
  function windGuidanceFor(current) {
    const data = buildHeroData({
      weather: {
        ...baseWeather,
        current: { ...baseWeather.current, ...current },
      },
      location: baseLocation,
      unit: "F",
    });
    return data.dailyGuidance.find((item) => item.kind === "wind") ?? null;
  }

  test("reports wind as unavailable when neither speed nor gust returned", () => {
    // The failure this guards: deriving strongest wind as
    // Math.max(speed ?? 0, gust ?? 0) and then reporting a confident
    // "Comfortable wind, up to 0 mph" for data that never arrived.
    const wind = windGuidanceFor({ windSpeed: null, windGust: null });

    assert.equal(wind.tone, "unavailable");
    assert.equal(wind.value, "Wind unavailable");
    assert.doesNotMatch(wind.detail, /0/);
  });

  test("uses the gust when only the gust returned", () => {
    const wind = windGuidanceFor({ windSpeed: null, windGust: 34 });

    assert.equal(wind.value, "Gusty conditions");
    assert.match(wind.detail, /34/);
  });

  test("uses the sustained speed when only the speed returned", () => {
    const wind = windGuidanceFor({ windSpeed: 34, windGust: null });

    assert.equal(wind.value, "Gusty conditions");
    assert.match(wind.detail, /34/);
  });

  test("a genuine calm zero is a reading, and a missing one is not", () => {
    // Distinguishing missing from zero is the whole contract. 0 mph is real
    // weather: it resolves to the calm tone, which guidance drops as a
    // non-event. Absent readings take the unavailable branch and are shown.
    // Asserting both halves keeps this from passing vacuously — a filtered
    // item and an absent item both read as undefined if you only check one.
    assert.equal(
      windGuidanceFor({ windSpeed: 0, windGust: null }),
      null,
      "calm wind is a real reading, filtered out as a non-event"
    );
    assert.equal(
      windGuidanceFor({ windSpeed: null, windGust: null }).tone,
      "unavailable",
      "absent wind is surfaced, not silently dropped as calm"
    );
  });
});
