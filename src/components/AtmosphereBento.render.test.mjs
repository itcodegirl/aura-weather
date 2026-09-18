import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const AtmosphereBento = (await import("./AtmosphereBento.jsx")).default;

afterEach(() => {
  cleanup();
});

// The panel reads the clock through useTimeNow, which these tests do not
// mock, so "today" and "this hour" are the real ones and the fixture is
// built from them: today's date, and an hourly UV series for today.
function pad(value) {
  return String(value).padStart(2, "0");
}

function naiveLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

function isoLocalDate(date) {
  return naiveLocal(date).slice(0, 10);
}

const NOW = new Date();
const TODAY = isoLocalDate(NOW);
const CURRENT_HOUR = NOW.getHours();
// Today's peak hour, never the current hour, so the two readings differ.
const PEAK_HOUR = CURRENT_HOUR === 13 ? 14 : 13;
const UV_NOW = 3.4;
const UV_PEAK = 8.1;

function todayHourly() {
  const time = [];
  const uvIndex = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const slot = new Date(NOW);
    slot.setHours(hour, 0, 0, 0);
    time.push(naiveLocal(slot));
    uvIndex.push(hour === CURRENT_HOUR ? UV_NOW : hour === PEAK_HOUR ? UV_PEAK : 1);
  }
  return { time, uvIndex };
}

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
  hourly: todayHourly(),
  daily: {
    time: [TODAY],
    uvIndexMax: [UV_PEAK],
    sunrise: [`${TODAY}T05:42:00`],
    sunset: [`${TODAY}T20:18:00`],
  },
  aqi: 42,
};

function uvTile(container) {
  return Array.from(container.querySelectorAll(".atm-tile")).find((tile) =>
    tile.textContent.includes("UV index")
  );
}

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
    // assert.ok on a boolean, not assert.equal(node, null): when that fails,
    // Node's assert inspects the jsdom node for its diff and never returns.
    assert.ok(
      !container.querySelector(".atm-footnote"),
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
    // A boolean, not assert.equal(node, null): when that fails, Node's
    // assert inspects the jsdom node for its diff and never returns.
    assert.ok(!container.querySelector(".atm-guidance"));
    assert.ok(screen.getByText("Not reported here"));
  });

  /*
   * Audit finding A-07. The tile printed daily.uvIndexMax — the day's
   * maximum — under help copy that said "right now", so at 9 am it read
   * "8 · Very High" over an actual index of about 2. It now reads this
   * hour's hourly uv_index, and names the peak underneath as a peak.
   */
  test("the UV tile reads this hour, and names today's peak with its hour underneath", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: FULL_WEATHER,
        aqi: 42,
        unit: "F",
      })
    );
    const tile = uvTile(container);
    assert.ok(tile, "UV tile rendered");
    assert.equal(tile.querySelector(".atm-val").textContent, "3");
    assert.equal(tile.querySelector(".atm-sub").textContent, "Moderate");

    const peakLine = tile.querySelector(".atm-peak-line").textContent;
    assert.match(peakLine, /^Peak(s|ed) at 8 around \d{1,2} (am|pm)$/);
    assert.ok(
      peakLine.startsWith(PEAK_HOUR > CURRENT_HOUR ? "Peaks" : "Peaked"),
      `tense follows the clock: ${peakLine}`
    );
    // The spoken form carries both readings, in the same order.
    assert.ok(
      screen.getByRole("img", { name: /^UV index 3 Moderate, peak(s|ed) at 8 around/ }),
      "gauge names this hour and the peak"
    );
  });

  test("without an hourly UV series the tile shows a dash and still names today's peak", () => {
    const { container } = render(
      React.createElement(AtmosphereBento, {
        weather: { ...FULL_WEATHER, hourly: undefined },
        aqi: 42,
        unit: "F",
      })
    );
    const tile = uvTile(container);
    // The peak must not stand in for the missing reading.
    assert.equal(tile.querySelector(".atm-val").textContent, "—");
    assert.equal(tile.querySelector(".atm-sub").textContent, "Unavailable");
    assert.equal(tile.querySelector(".atm-peak-line").textContent, "Today's peak 8");
    assert.ok(tile.classList.contains("atm-tile--missing"));
    assert.ok(container.querySelector(".atm-footnote"), "the dash is explained");
  });

  /*
   * Audit finding A-05. The panel read daily index 0 while the hero
   * resolves today, so a snapshot restored from yesterday showed
   * yesterday's sun times and UV peak beside a hero showing today's.
   */
  test("a snapshot restored from yesterday shows today's sun times and UV peak, not yesterday's", () => {
    const yesterdayDate = new Date(NOW);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = isoLocalDate(yesterdayDate);
    const stale = {
      ...FULL_WEATHER,
      daily: {
        time: [yesterday, TODAY],
        uvIndexMax: [1, UV_PEAK],
        sunrise: [`${yesterday}T05:00:00`, `${TODAY}T06:05:00`],
        sunset: [`${yesterday}T20:00:00`, `${TODAY}T19:58:00`],
      },
    };
    const { container } = render(
      React.createElement(AtmosphereBento, { weather: stale, aqi: 42, unit: "F" })
    );

    assert.ok(screen.getByText("6:05 am"), "today's sunrise");
    assert.ok(screen.getByText("7:58 pm"), "today's sunset");
    assert.ok(!screen.queryByText("5:00 am"), "yesterday's sunrise is not shown");
    assert.ok(!screen.queryByText("8:00 pm"), "yesterday's sunset is not shown");

    const peakLine = uvTile(container).querySelector(".atm-peak-line").textContent;
    assert.match(peakLine, /at 8 around/, `today's peak, not the stale index 0: ${peakLine}`);
  });

  /*
   * Unit 8b. getDaylightProgress clamped to 1.0 for every moment past
   * sunset, and SunTile's only guard is `progress !== null`, so a run-out
   * pair drew the bead parked at the end of the arc — pixel-identical to
   * the sun having just gone down, from a snapshot months old.
   *
   * These assert on the drawn bead rather than on the helper, because the
   * helper's own tests would have passed either way: what was wrong was
   * what a reader saw.
   */
  function sunArcCircles(container) {
    const arc = container.querySelector(".atm-sun-arc");
    assert.ok(arc, "the sun arc is rendered");
    return arc.querySelectorAll("circle");
  }

  test("draws no sun bead for a sun pair that ran out months ago", () => {
    const runOutDay = "2026-04-21";
    const runOut = {
      ...FULL_WEATHER,
      daily: {
        time: [runOutDay],
        uvIndexMax: [UV_PEAK],
        sunrise: [`${runOutDay}T05:42:00`],
        sunset: [`${runOutDay}T20:18:00`],
      },
    };
    const { container } = render(
      React.createElement(AtmosphereBento, { weather: runOut, aqi: 42, unit: "F" })
    );

    assert.equal(
      sunArcCircles(container).length,
      0,
      "a run-out pair must not place the sun anywhere on the arc"
    );
  });

  test("still draws the sun bead for today's sun pair", () => {
    // The control that stops this being fixed by never drawing the bead.
    const { container } = render(
      React.createElement(AtmosphereBento, { weather: FULL_WEATHER, aqi: 42, unit: "F" })
    );

    assert.equal(
      sunArcCircles(container).length,
      2,
      "today's pair still places the sun on the arc"
    );
  });

  /*
   * Finding #2. This panel is a resolveTodayIndex caller, and the decision
   * (docs/decisions/resolveTodayIndex-runout.md) splits it: the UV tile makes
   * a present-tense claim and degrades, the sun tile keeps reading index 0 so
   * this panel and the Week Ahead cannot disagree about which day they show.
   *
   * Both halves are pinned, because "decided unchanged" and "nobody looked"
   * are indistinguishable a year from now.
   */
  describe("a daily series that has run out", () => {
    const RUN_OUT_DAY = "2026-04-21";
    function runOutWeather() {
      return {
        ...FULL_WEATHER,
        daily: {
          time: [RUN_OUT_DAY],
          uvIndexMax: [UV_PEAK],
          sunrise: [`${RUN_OUT_DAY}T05:42:00`],
          sunset: [`${RUN_OUT_DAY}T20:18:00`],
        },
      };
    }

    test("the UV tile reads Unavailable rather than the stale day's peak", () => {
      const { container } = render(
        React.createElement(AtmosphereBento, { weather: runOutWeather(), aqi: 42, unit: "F" })
      );
      const tile = uvTile(container);

      assert.match(tile.textContent, /Unavailable/);
      assert.ok(
        !tile.textContent.includes(String(UV_PEAK)),
        `the run-out day's peak must not render: ${tile.textContent}`
      );
      assert.equal(
        tile.querySelector(".atm-peak-line"),
        null,
        "no peak line without a day to attribute it to"
      );
    });

    test("the panel still renders rather than crashing on a null outlook", () => {
      // readUvOutlook answers null, not an object of nulls. UvTile has to
      // take that without throwing, or the whole bento goes down with it.
      const { container } = render(
        React.createElement(AtmosphereBento, { weather: runOutWeather(), aqi: 42, unit: "F" })
      );
      assert.ok(container.querySelector(".bento-atm"), "the panel rendered");
    });

    test("the sun tile still reads index 0, by decision", () => {
      const { container } = render(
        React.createElement(AtmosphereBento, { weather: runOutWeather(), aqi: 42, unit: "F" })
      );
      // Same day ForecastCard falls back to, so the two cannot disagree.
      assert.ok(screen.getByText("5:42 am"), "the sun times still come from index 0");
      assert.equal(
        sunArcCircles(container).length,
        0,
        "the bead is still withheld — getDaylightProgress answers null (unit 8b)"
      );
    });
  });
});
