import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const HeroCard = (await import("./HeroCard.jsx")).default;

afterEach(() => {
  cleanup();
});

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
    uvIndexMax: [7],
  },
};

function buildWeather(overrides = {}) {
  return {
    ...baseWeather,
    ...overrides,
    current: { ...baseWeather.current, ...(overrides.current || {}) },
    daily: { ...baseWeather.daily, ...(overrides.daily || {}) },
  };
}

describe("HeroCard with missing readings", () => {
  test("renders 0%/0 hPa nowhere when humidity and pressure are null", () => {
    const weather = buildWeather({
      current: { humidity: null, pressure: null, dewPoint: null },
    });

    const { container } = render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    const visibleText = container.textContent || "";
    assert.equal(
      visibleText.includes("0%"),
      false,
      "rendered text must not contain '0%'"
    );
    assert.equal(
      visibleText.includes("0 hPa"),
      false,
      "rendered text must not contain '0 hPa'"
    );
    assert.equal(
      visibleText.includes("—°F"),
      false,
      "rendered text must not contain the malformed '—°F' string"
    );
  });

  test("does not show the helper note when every hero stat is present", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(container.querySelector(".hero-stats-note"), null);
  });

});

/*
 * HeroCard takes no nowMs prop — it subscribes to useTimeNow, which reads
 * Date.now() at mount while its bucket is dormant (afterEach's cleanup
 * unsubscribes, so every test mounts dormant). Stubbing Date.now is
 * therefore the one honest way to place the hero at a chosen hour. The
 * fixture's sun window is 06:18–19:41 at -05:00 (11:18–00:41 UTC), and
 * 18:00 UTC is already aligned to the hero's 5-minute bucket.
 */
const DAYLIGHT_NOW = Date.UTC(2026, 3, 21, 18, 0, 0);
const AFTER_SUNSET = Date.UTC(2026, 3, 22, 2, 0, 0);

function renderHeroAt(nowMs, props) {
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    return render(React.createElement(HeroCard, props));
  } finally {
    Date.now = realNow;
  }
}

describe("HeroCard daily planning guidance", () => {
  const decisionDay = buildWeather({
    current: { windSpeed: 22, windGust: 34 },
    daily: { rainChanceMax: [68], rainAmountTotal: [0.18], uvIndexMax: [8.4] },
  });

  test("surfaces the actionable rain/UV/wind guidance the hero computes", () => {
    // UV advice is daylight-only (audit finding 22), so the hour is part of
    // the fixture. This test used to render with no clock at all and still
    // expect sun protection.
    const { container } = renderHeroAt(DAYLIGHT_NOW, {
      weather: decisionDay,
      location: baseLocation,
      unit: "F",
    });

    const guidance = container.querySelector(".hero-guidance");
    assert.ok(guidance, "guidance grid renders when conditions warrant a decision");
    assert.equal(
      guidance.getAttribute("aria-label"),
      "Today's planning guidance"
    );
    const text = guidance.textContent || "";
    assert.ok(text.includes("Bring rain gear"), "surfaces rain-gear guidance");
    assert.ok(text.includes("Very high exposure"), "surfaces UV guidance");
    assert.ok(text.includes("Gusty conditions"), "surfaces wind guidance");
  });

  test("drops the UV pill after sunset and keeps the rest", () => {
    // The rendered half of finding 22. Three of the hero's four UV
    // surfaces advised sun protection at midnight; the guidance pill is
    // present-tense advice and now follows the reading line's daylight
    // rule. Rain and wind are not time-of-day advice and must survive.
    const { container } = renderHeroAt(AFTER_SUNSET, {
      weather: decisionDay,
      location: baseLocation,
      unit: "F",
    });

    const guidance = container.querySelector(".hero-guidance");
    assert.ok(guidance, "the grid still renders for rain and wind");
    const text = guidance.textContent || "";
    assert.ok(text.includes("Bring rain gear"), "rain guidance survives the night");
    assert.ok(text.includes("Gusty conditions"), "wind guidance survives the night");
    assert.equal(
      text.includes("Very high exposure"),
      false,
      "no sun advice after dark"
    );
    assert.equal(
      container.querySelectorAll(".hero-guidance-item").length,
      2,
      "exactly the two time-independent pills remain"
    );
  });

  test("renders no guidance grid on a calm day so it never narrates a non-event", () => {
    const weather = buildWeather({
      current: { windSpeed: 4, windGust: 6 },
      daily: { rainChanceMax: [3], rainAmountTotal: [0], uvIndexMax: [1.2] },
    });

    const { container } = render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    assert.equal(
      container.querySelector(".hero-guidance"),
      null,
      "calm-only guidance is filtered out before render"
    );
  });

  test("labels guidance unavailable instead of inventing a reading", () => {
    const weather = buildWeather({
      current: { windSpeed: null, windGust: null },
      daily: { rainChanceMax: [null], rainAmountTotal: [null], uvIndexMax: [null] },
    });

    const { container } = render(
      React.createElement(HeroCard, {
        weather,
        location: baseLocation,
        unit: "F",
      })
    );

    const guidance = container.querySelector(".hero-guidance");
    assert.ok(guidance, "missing guidance is shown honestly, not hidden");
    assert.ok(
      container.querySelector(".hero-guidance-item--unavailable"),
      "uses the unavailable tone modifier for missing readings"
    );
    assert.ok((guidance.textContent || "").includes("unavailable"));
  });
});

describe("HeroCard UV panel", () => {
  test("renders the computed UV panel (level, peak, guidance) when the reading exists", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ daily: { uvIndexMax: [7] } }),
        location: baseLocation,
        unit: "F",
      })
    );

    const panel = container.querySelector(".hero-uv-panel");
    assert.ok(panel, "UV panel renders when the daily UV peak is present");
    const text = panel.textContent || "";
    assert.match(text, /UV High/, "shows the severity level word");
    assert.match(text, /Peak UV 7\.0/, "shows the peak reading");
    assert.match(text, /High UV today/, "shows the plain-language guidance line");

    const marker = panel.querySelector(".hero-uv-marker");
    assert.ok(marker, "the graded track carries a position marker");
    assert.ok(
      marker.style.left.startsWith("63.6"),
      `marker sits at 7/11 ≈ 63.6% (got ${marker.style.left})`
    );
  });

  /*
   * Audit finding 22, the design half, verified through the DOM rather than
   * the builder: the panel keeps reporting the reading after sunset (the
   * trust contract owes the number at any hour) but stops saying protection
   * "is worth it" for a day that has ended.
   */
  test("states the UV line in past tense after sunset, keeping the reading", () => {
    const { container } = renderHeroAt(AFTER_SUNSET, {
      weather: buildWeather({ daily: { uvIndexMax: [7] } }),
      location: baseLocation,
      unit: "F",
    });

    const panel = container.querySelector(".hero-uv-panel");
    assert.ok(panel, "the reading survives sunset — only the tense changes");
    const text = panel.textContent || "";
    assert.match(text, /UV High/, "still names the band");
    assert.match(text, /Peak UV 7\.0/, "still shows the peak that occurred");
    assert.match(text, /was worth it midday/, "reports the finished day");
    assert.doesNotMatch(
      text,
      /is worth it/,
      "no present-tense advice once the sun is down"
    );
  });

  test("keeps the UV line in present tense during daylight", () => {
    const { container } = renderHeroAt(DAYLIGHT_NOW, {
      weather: buildWeather({ daily: { uvIndexMax: [7] } }),
      location: baseLocation,
      unit: "F",
    });

    const text = container.querySelector(".hero-uv-panel").textContent || "";
    assert.match(text, /is worth it midday/);
    assert.doesNotMatch(text, /was worth it/);
  });

  test("drops the UV panel entirely when the UV reading is missing", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ daily: { uvIndexMax: [null] } }),
        location: baseLocation,
        unit: "F",
      })
    );
    assert.equal(
      container.querySelector(".hero-uv-panel"),
      null,
      "missing UV must drop the whole panel, not paint an empty graded bar"
    );
  });
});

describe("HeroCard trust pill confidence", () => {
  const MINUTE = 60_000;

  test("reads 'High confidence' only for a fresh live reading", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
        trustMeta: { weatherFetchedAt: Date.now() - 2 * MINUTE },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill, "trust pill renders when a fetch timestamp exists");
    assert.ok(pill.classList.contains("hero-trust-pill--live"));
    assert.match(pill.textContent, /High confidence/);
  });

  test("does not claim 'High confidence' for a forecast restored from cache", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
        trustMeta: {
          cacheStatus: "restored",
          cacheCapturedAt: Date.now() - 90 * MINUTE,
          weatherFetchedAt: null,
        },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill.classList.contains("hero-trust-pill--saved"));
    assert.match(pill.textContent, /Saved forecast/);
    assert.doesNotMatch(
      pill.textContent,
      /High confidence/,
      "cached data must not assert high confidence"
    );
  });

  test("downgrades to 'Confidence fading' once a live reading goes stale", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
        trustMeta: { weatherFetchedAt: Date.now() - 40 * MINUTE },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill.classList.contains("hero-trust-pill--stale"));
    assert.match(pill.textContent, /Confidence fading/);
    assert.doesNotMatch(pill.textContent, /High confidence/);
  });

  // The pill sits above the hero's headline reading. Freshness is not the same
  // as having data to be confident about: when the headline itself is missing,
  // a fresh fetch must not be dressed up as confidence. Each case below uses a
  // FRESH weatherFetchedAt, so without the headline check the pill would read
  // "High confidence" — these prove the absence outranks freshness.

  test("does not claim confidence when the headline temperature is missing", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ current: { temperature: null } }),
        location: baseLocation,
        unit: "F",
        trustMeta: { weatherFetchedAt: Date.now() },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill.classList.contains("hero-trust-pill--unavailable"));
    assert.match(pill.textContent, /Current data unavailable/);
    assert.doesNotMatch(
      pill.textContent,
      /High confidence/,
      "a missing headline temperature must not read as high confidence"
    );
  });

  test("does not claim confidence when the headline condition is missing", () => {
    // Temperature present, condition code absent → the condition renders
    // "Not reported". The pill must track the condition too, not just temp.
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ current: { conditionCode: null } }),
        location: baseLocation,
        unit: "F",
        trustMeta: { weatherFetchedAt: Date.now() },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill.classList.contains("hero-trust-pill--unavailable"));
    assert.doesNotMatch(pill.textContent, /High confidence/);
  });

  test("keeps 'High confidence' when the headline is present but a sub-reading is missing", () => {
    // Temp + condition present, humidity absent (Atmosphere shows "—"). The
    // pill fronts a real current reading, so it must stay confident — the fix
    // must not over-trigger on normal partial data.
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather({ current: { humidity: null } }),
        location: baseLocation,
        unit: "F",
        trustMeta: { weatherFetchedAt: Date.now() },
      })
    );

    const pill = container.querySelector(".hero-trust-pill");
    assert.ok(pill.classList.contains("hero-trust-pill--live"));
    assert.match(pill.textContent, /High confidence/);
    assert.doesNotMatch(pill.textContent, /Current data unavailable/);
  });
});

describe("HeroCard accessibility scaffolding", () => {
  test("emits a visually-hidden h3 that names the section by location", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading, "hero card emits a heading element for SR navigation");
    assert.match(
      heading.textContent,
      /Current weather/,
      "heading announces the section role"
    );
    assert.match(
      heading.textContent,
      /Chicago/,
      "heading mentions the location so SR users hear which city"
    );
    assert.ok(
      heading.classList.contains("sr-only"),
      "heading is visually hidden so the visible layout stays unchanged"
    );
  });

  test("section is labelled by the heading id so SR users hear the section name", () => {
    const { container } = render(
      React.createElement(HeroCard, {
        weather: buildWeather(),
        location: baseLocation,
        unit: "F",
      })
    );

    const section = container.querySelector("section.bento-hero");
    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading?.id, "heading carries a useId-generated id");
    assert.equal(
      section?.getAttribute("aria-labelledby"),
      heading.id,
      "section is wired to the heading via aria-labelledby"
    );
  });

  test("loading-fallback (no heroData) still emits the heading", () => {
    // Passing weather without `current` triggers the early-return
    // placeholder branch — it should still expose a heading so SR
    // users learn this card is loading.
    const { container } = render(
      React.createElement(HeroCard, {
        weather: { current: null, daily: null },
        location: baseLocation,
        unit: "F",
      })
    );

    const heading = container.querySelector("h3.sr-only");
    assert.ok(heading, "fallback branch emits a heading too");
    assert.equal(heading.textContent, "Current weather");
  });
});

describe("HeroCard placeholder path (buildHeroData returned null)", () => {
  test("with a resolved location, surfaces the location name and names the missing piece", () => {
    // weather.current is missing — we know where the user is but the
    // forecast hasn't given us readings. The hero must not call this
    // a loading state (the previous "Loading weather" copy lied) and
    // must keep showing the actual location.
    render(
      React.createElement(HeroCard, {
        weather: { meta: { timezone: "America/Chicago" } },
        location: baseLocation,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    assert.ok(
      screen.getByText("Chicago, United States"),
      "real location stays visible on the placeholder path"
    );
    assert.ok(
      screen.getByText("Readings unavailable"),
      "date slot names the missing piece honestly"
    );
    assert.ok(
      screen.getByText(/Current readings aren[’']t available right now/),
      "body copy explains the state in the trust-contract voice"
    );
    assert.equal(
      screen.queryByText("Loading weather"),
      null,
      "must not regress to the old 'Loading weather' copy"
    );
    assert.equal(
      screen.queryByText("Location unavailable"),
      null,
      "must not regress to the old 'Location unavailable' copy when location is resolved"
    );
  });

  test("with no location, invites the user to pick one — does not fake a loading state", () => {
    render(
      React.createElement(HeroCard, {
        weather: null,
        location: null,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    assert.ok(screen.getByText("No location selected"));
    assert.ok(screen.getByText("Choose a place to begin"));
    assert.ok(screen.getByText(/Pick a location to see live conditions/));
    assert.equal(
      screen.queryByText("Loading weather"),
      null,
      "no-location path must not pretend to be loading either"
    );
  });

  test("placeholder body region is announced politely (role=status)", () => {
    render(
      React.createElement(HeroCard, {
        weather: null,
        location: null,
        unit: "F",
        nowMs: Date.parse("2026-04-21T12:00:00-05:00"),
      })
    );

    const region = screen.getByRole("status");
    assert.ok(
      region.textContent.includes("Pick a location"),
      "status region carries the actionable invitation copy"
    );
  });
});
