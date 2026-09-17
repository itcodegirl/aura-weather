import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const AtmosphereBento = (await import("./AtmosphereBento.jsx")).default;

afterEach(() => {
  cleanup();
});

const FULL_WEATHER = {
  current: {
    humidity: 58,
    dewPoint: 52,
    windSpeed: 12,
    windGust: 18,
    windDirection: 270,
    pressure: 1013,
    // Metres (the model's unit): ten miles is 16,093.4 m, rounded up so the
    // reading sits on the clear side of the tile's ten-mile boundary.
    visibility: 16094,
  },
  daily: {
    uvIndexMax: [6.2],
    sunrise: ["2024-06-15T05:42:00"],
    sunset: ["2024-06-15T20:18:00"],
  },
  aqi: 42,
};

describe("AtmosphereBento", () => {
  test("renders without crashing on full weather data", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    assert.ok(section, "bento-atm section rendered");
  });

  test("renders without crashing with null weather", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: null,
        aqi: null,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    assert.ok(section, "bento-atm section rendered even with null data");
  });

  test("shows humidity value when available", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    assert.ok(screen.getByText("58%"), "humidity value rendered");
  });

  test("AQI tile renders as missing (dashed) when aqi is null", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    const missing = container.querySelectorAll(".atm-tile--missing");
    assert.ok(missing.length >= 1, "AQI tile renders as a missing tile when aqi is null");
  });

  test("does not render a permanently-empty placeholder tile", () => {
    // The Moon tile used to render a structurally-always-empty
    // "Not in forecast" slot — the one place the dashboard showed a
    // gap for data it never has. With full weather + AQI present,
    // nothing should report itself as missing.
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    assert.equal(
      screen.queryByText("Not in forecast"),
      null,
      "no 'Not in forecast' placeholder tile remains"
    );
    assert.equal(
      container.querySelectorAll(".atm-tile--missing").length,
      0,
      "every rendered tile carries real data when the provider supplies it"
    );
  });

  test("section has accessible aria-labelledby pointing to a real element", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    const section = container.querySelector(".bento-atm");
    const labelId = section?.getAttribute("aria-labelledby");
    assert.ok(labelId, "section has aria-labelledby");
    const heading = container.ownerDocument.getElementById(labelId);
    assert.ok(heading, "the labelled element exists in the DOM");
  });

  test("shows pressure in inHg in imperial unit mode", () => {
    // 1013 hPa × 0.02953 = 29.91 inHg. The unit reads "inHg", never a bare
    // "in" that a dashboard printing rain depths in inches could be taken for.
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    assert.equal(container.querySelector(".atm-val--pressure").textContent, "29.91");
    assert.ok(screen.getByText("inHg"), "imperial pressure unit rendered");
    assert.equal(screen.queryByText("in"), null, "no bare 'in' unit");
    assert.ok(
      screen.getByRole("img", { name: "Pressure 29.91 inches of mercury" }),
      "the gauge spells the unit out for assistive tech"
    );
  });

  test("shows pressure in hPa in metric unit mode", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "C",
      })
    );
    assert.equal(container.querySelector(".atm-val--pressure").textContent, "1013");
    assert.ok(screen.getByText("hPa"), "metric pressure unit rendered");
    assert.ok(screen.getByRole("img", { name: "Pressure 1013 hectopascals" }));
  });

  test("explains the em-dash placeholder when a reading is missing", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );
    const footnote = container.querySelector(".atm-footnote");
    assert.ok(footnote, "a footnote explains the dash when one is on screen");
    assert.match(footnote.textContent, /isn’t a zero/);
    // These readings come from a forecast model, not a weather station on the
    // corner. Naming the wrong source inside the honesty message is a lie.
    assert.match(footnote.textContent, /the provider didn’t report/);
    assert.doesNotMatch(footnote.textContent, /station/i);
  });

  test("omits the placeholder footnote when every reading is present", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    assert.equal(
      container.querySelector(".atm-footnote"),
      null,
      "no dash on screen means no footnote"
    );
  });

  test("renders visibility from a metre reading, in miles and in kilometres", () => {
    // FULL_WEATHER.visibility is 16,093 m — ten miles. The tile once read the
    // provider's raw feet as metres (48,885 ft printed "30 mi · clear" on a
    // nine-mile day); normalizeWeatherResponse now hands it metres, and this
    // pins the tile's own arithmetic on that contract.
    const { container, unmount } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    assert.equal(container.querySelector(".atm-val--vis").textContent, "10");
    assert.ok(screen.getByRole("img", { name: "Visibility 10 mi clear" }));
    unmount();

    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "C",
      })
    );
    assert.ok(screen.getByRole("img", { name: "Visibility 16 km clear" }));
  });

  test("a nine-mile day reads as hazy, not as thirty clear miles", () => {
    const weather = {
      ...FULL_WEATHER,
      current: { ...FULL_WEATHER.current, visibility: 14900 },
    };
    render(
      React.createElement(AtmosphereBento, { weather, aqi: 42, unit: "F" })
    );

    assert.ok(screen.getByRole("img", { name: "Visibility 9.3 mi hazy" }));
    assert.equal(screen.queryByRole("img", { name: /Visibility 30 mi/ }), null);
  });
});

describe("AtmosphereBento explains its readings", () => {
  test("every tile carries a help drawer", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );

    // Eight tiles: humidity, UV, AQI, pressure, wind, sun, dew point,
    // visibility. Each was previously a bare gauge with no way to learn what
    // it meant.
    assert.equal(container.querySelectorAll(".atm-help-drawer").length, 8);
  });

  test("the help is opt-in, not printed on the tile face", () => {
    render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );

    // The scannable surface has to stay scannable: the explanation lives
    // behind the drawer trigger, closed until asked for.
    assert.equal(screen.queryByText(/moisture condenses out of it/i), null);
    assert.ok(screen.getByRole("button", { name: "About Dew point" }));
  });

  test("air quality says what to do, not just how bad it is", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 156,
        unit: "F",
      })
    );

    const guidance = container.querySelector(".atm-guidance");
    assert.ok(guidance, "an unhealthy reading carries an action line");
    assert.match(guidance.textContent, /cut back on long or intense outdoor/i);
  });

  test("a missing air-quality reading offers no reassurance", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: null,
        unit: "F",
      })
    );

    // Absent AQI must not render "Air is clean. No precautions needed."
    assert.equal(container.querySelector(".atm-guidance"), null);
    assert.ok(screen.getByText("Not reported here"));
  });
});
