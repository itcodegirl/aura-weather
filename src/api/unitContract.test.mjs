import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { normalizeWeatherResponse, UnitContractError } from "./transforms.js";

/*
 * The failure class behind this app's three worst bugs.
 *
 * Each began the same way: a number arrived in a unit nobody checked, and
 * every layer downstream read it as the unit it expected. Visibility came in
 * feet and the Atmosphere tile divided by 1,609 as though it were metres —
 * "30 mi · clear" on a nine-mile day. Pressure came from the station rather
 * than sea level and sat ~21 hPa low against every barometer. Precipitation
 * was read in the wrong unit.
 *
 * None of them looked like a bug from inside the code. That is the point: a
 * wrong unit is the only failure this app has that produces a *plausible*
 * number, so it passes review, passes tests written against the same wrong
 * assumption, and renders as data. Missing data renders as "—" and is
 * obvious; 30 miles of visibility is not.
 *
 * `@ts-check` cannot see any of it — feet and metres are both `number`. Nor
 * can a schema check: the shape is right. Only the provider's own declared
 * unit can settle it, and until now nothing read it except `normalizeVisibility`.
 *
 * So the tests below feed responses that declare the WRONG unit and prove the
 * boundary refuses them. Each of the three historical bugs gets a case in the
 * unit it actually arrived in.
 */

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./__fixtures__/open-meteo-forecast.recorded.json", import.meta.url)),
    "utf8"
  )
);

/** The recorded response with one declared unit swapped. */
function withDeclaredUnit(section, field, unit) {
  return {
    ...FIXTURE,
    [section]: { ...FIXTURE[section], [field]: unit },
  };
}

/** The error a call threw. `assert.throws` returns undefined, not the error. */
function thrownBy(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw, and it did not");
}

describe("the unit contract", () => {
  describe("the recorded response is the control", () => {
    test("a real payload passes, and carries its declared units", () => {
      // Positive control. Every rejection below is only meaningful if the
      // unmodified response is accepted — otherwise the check could be
      // refusing everything and the failure cases would still "pass".
      const model = normalizeWeatherResponse(FIXTURE);

      assert.equal(model.meta.units.current.temperature_2m, "°F");
      assert.equal(model.meta.units.hourly.precipitation, "inch");
      // Open-Meteo spells it "mp/h". A table written from the docs rather
      // than from a response would have been wrong on this field.
      assert.equal(model.meta.units.current.wind_speed_10m, "mp/h");
      assert.equal(model.meta.units.visibility.current, "ft");
    });

    test("the fixture really does declare units, so the control is not vacuous", () => {
      assert.ok(
        FIXTURE.current_units?.temperature_2m,
        "the recorded fixture lost its current_units block"
      );
      assert.ok(FIXTURE.hourly_units?.precipitation);
      assert.ok(FIXTURE.minutely_15_units?.precipitation);
    });
  });

  describe("a wrong declared unit is refused, not rendered", () => {
    test("temperature in °C", () => {
      // 22 °C read as °F is a 72-degree day rendered as a 22-degree one.
      const error = thrownBy(() =>
        normalizeWeatherResponse(withDeclaredUnit("current_units", "temperature_2m", "°C"))
      );
      assert.ok(error instanceof UnitContractError, `expected UnitContractError, got ${error}`);
      assert.equal(error.section, "current");
      assert.equal(error.field, "temperature_2m");
      assert.equal(error.declared, "°C");
      assert.equal(error.expected, "°F");
      assert.match(error.message, /current\.temperature_2m/);
      assert.match(error.message, /"°C"/);
      assert.match(error.message, /"°F"/);
    });

    test("precipitation in mm", () => {
      // The one with the largest multiplier: 25.4 mm read as inches is a
      // wet day rendered as a biblical one, and 1 mm as a dry drizzle.
      const error = thrownBy(() =>
        normalizeWeatherResponse(withDeclaredUnit("hourly_units", "precipitation", "mm"))
      );
      assert.ok(error instanceof UnitContractError);
      assert.equal(error.section, "hourly");
      assert.equal(error.declared, "mm");
      assert.equal(error.expected, "inch");
    });

    test("wind speed in km/h", () => {
      const error = thrownBy(() =>
        normalizeWeatherResponse(withDeclaredUnit("current_units", "wind_speed_10m", "km/h"))
      );
      assert.ok(error instanceof UnitContractError);
      assert.equal(error.field, "wind_speed_10m");
      assert.equal(error.declared, "km/h");
    });

    test("pressure in inHg", () => {
      const error = thrownBy(() =>
        normalizeWeatherResponse(withDeclaredUnit("hourly_units", "pressure_msl", "inHg"))
      );
      assert.ok(error instanceof UnitContractError);
      assert.equal(error.field, "pressure_msl");
      assert.equal(error.expected, "hPa");
    });

    test("the 15-minute series is checked too", () => {
      // The nowcast reads its own precipitation series. It has its own
      // declared-units block and was the one nothing looked at.
      const error = thrownBy(() =>
        normalizeWeatherResponse(withDeclaredUnit("minutely_15_units", "precipitation", "mm"))
      );
      assert.ok(error instanceof UnitContractError);
      assert.equal(error.section, "minutely_15");
      assert.equal(error.field, "precipitation");
    });

    test("nothing is built from a refused payload", () => {
      // Half a model from a wrong-unit response would be worse than none:
      // the fields checked later would be right and the earlier ones wrong,
      // with no way for a reader to tell which. The throw happens before
      // any mapping, so there is no partial model to leak.
      assert.throws(
        () => normalizeWeatherResponse(withDeclaredUnit("current_units", "temperature_2m", "°C")),
        (error) => error instanceof UnitContractError && error.name === "UnitContractError"
      );
    });
  });

  describe("silence is not disagreement", () => {
    test("a payload that declares no units is accepted", () => {
      // Every hand-built mock and every render-test payload in this repo is
      // shaped like this. They are not wrong, merely quiet — and a check
      // that refused them would have been reverted within the hour.
      const model = normalizeWeatherResponse({
        latitude: 41.88,
        longitude: -87.63,
        timezone: "America/Chicago",
        current: { temperature_2m: 72.4 },
        hourly: { time: ["2026-04-20T12:00"], temperature_2m: [72.4] },
      });
      assert.equal(model.current.temperature, 72.4);
      assert.deepEqual(model.meta.units.current, {});
    });

    test("one declared field does not require the rest", () => {
      const model = normalizeWeatherResponse({
        current: { temperature_2m: 72.4 },
        current_units: { temperature_2m: "°F" },
      });
      assert.equal(model.meta.units.current.temperature_2m, "°F");
      assert.equal(model.meta.units.current.wind_speed_10m, undefined);
    });

    test("whitespace around a declared unit is not a mismatch", () => {
      const model = normalizeWeatherResponse({
        current: { temperature_2m: 72.4 },
        current_units: { temperature_2m: "  °F  " },
      });
      assert.equal(model.meta.units.current.temperature_2m, "°F");
    });
  });

  describe("what is deliberately not asserted", () => {
    test("visibility is converted, not pinned", () => {
      // Its declared unit is an INPUT to normalizeVisibility. Asserting "ft"
      // would break the documented metres default and defeat the conversion
      // that fixed the original bug. Both readings are accepted and both
      // land in the model as metres.
      const feet = normalizeWeatherResponse({
        current: { visibility: 48885 },
        current_units: { visibility: "ft" },
      });
      const metres = normalizeWeatherResponse({
        current: { visibility: 14900 },
        current_units: { visibility: "m" },
      });
      assert.equal(Math.round(feet.current.visibility), 14900);
      assert.equal(metres.current.visibility, 14900);
    });

    test("fields with no magnitude to misread are ignored", () => {
      // weather_code ("wmo code"), uv_index and is_day ("") carry no unit a
      // reader could get wrong. Asserting them would be noise that breaks on
      // a provider's harmless relabelling.
      const model = normalizeWeatherResponse({
        current: { weather_code: 2, is_day: 1 },
        current_units: { weather_code: "anything at all", is_day: "???" },
        hourly: { uv_index: [5] },
        hourly_units: { uv_index: "whatever" },
      });
      assert.equal(model.current.conditionCode, 2);
    });
  });
});
