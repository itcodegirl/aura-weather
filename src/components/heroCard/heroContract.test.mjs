import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildHeroData } from "./buildHeroData.js";

/*
 * `buildHeroData` has exactly one consumer, and everything it returns should
 * reach it.
 *
 * Eleven keys did not. The hero used to render its own humidity, pressure,
 * dew point and wind readings; the bento tiles took those over and the
 * destructuring in HeroCard shrank, but the builder kept computing all of
 * them — four formatted strings, a flag summarising whether any were missing,
 * three sun labels and two raw sun values — on every render, for nobody.
 *
 * Nothing caught it and nothing could. Dead output is not dead code: the
 * linter sees every one of those locals being read, because they are read —
 * into an object literal that is then partly ignored. The builder's own unit
 * tests asserted on the dead fields and passed, which made the dead half look
 * more tested than the live half.
 *
 * So this compares the two sets directly. Reading `buildHeroData`'s keys off a
 * real call rather than parsing its `return` block is deliberate: the return
 * contains call expressions and comments, and a regex over it would be the
 * kind of detector that silently stops matching.
 */

const HERO_CARD = fileURLToPath(new URL("../HeroCard.jsx", import.meta.url));

/*
 * The `const { … } = heroData;` block in HeroCard. Anchored on the assignment
 * rather than on a bare `const {`, so an unrelated destructuring elsewhere in
 * the component cannot be mistaken for this one.
 */
const DESTRUCTURE_BLOCK = /const\s*\{([^}]*)\}\s*=\s*heroData\s*;/;

function destructuredKeys(source) {
  const match = DESTRUCTURE_BLOCK.exec(source);
  assert.ok(
    match,
    "HeroCard no longer destructures heroData in a shape this gate can read — " +
      "update the pattern rather than deleting the check"
  );
  return match[1]
    .split(",")
    .map((entry) => entry.split(":")[0].trim())
    .filter(Boolean)
    .sort();
}

/**
 * A payload complete enough that `buildHeroData` returns its full shape.
 *
 * It does not need to be realistic — no assertion here reads a value — but it
 * does need every branch that adds a key to be taken, which is why the daily
 * arrays and the sun times are present.
 */
function buildFixture() {
  return {
    weather: {
      current: {
        temperature: 68,
        feelsLike: 66,
        dewPoint: 52,
        humidity: 58,
        pressure: 1014,
        windSpeed: 9,
        windDirection: 220,
        conditionCode: 1,
        time: "2026-09-17T12:00",
      },
      hourly: {
        time: ["2026-09-17T12:00", "2026-09-17T13:00"],
        temperature: [68, 69],
        rainChance: [10, 12],
        rainAmount: [0, 0],
        uvIndex: [5, 4],
      },
      daily: {
        time: ["2026-09-17"],
        temperatureMax: [74],
        temperatureMin: [58],
        sunrise: ["2026-09-17T06:36"],
        sunset: ["2026-09-17T19:02"],
        uvIndexMax: [6],
      },
      meta: { timezone: "America/Chicago" },
    },
    location: { name: "Palos Hills", country: "US" },
    unit: "F",
    climateComparison: null,
    nowMs: Date.UTC(2026, 8, 17, 17, 0),
    aqi: null,
  };
}

describe("the hero data contract", () => {
  describe("the detector works", () => {
    // Positive controls. An empty key set on either side would make the
    // comparison below pass vacuously, which is the same shape of mistake as
    // the one this file exists to catch.
    test("the destructuring pattern reads a representative block", () => {
      const keys = destructuredKeys(
        "  const {\n    info,\n    tempUnit,\n    today,\n  } = heroData;\n"
      );
      assert.deepEqual(keys, ["info", "tempUnit", "today"]);
    });

    test("a renamed target fails rather than reporting an empty set", () => {
      assert.throws(
        () => destructuredKeys("const { info } = someOtherThing;"),
        /HeroCard no longer destructures heroData/
      );
    });
  });

  describe("every key the builder returns is read", () => {
    const heroData = buildHeroData(buildFixture());
    const source = readFileSync(HERO_CARD, "utf8");

    test("the fixture produces a full hero payload", () => {
      // Without this, a fixture that made buildHeroData return null would
      // make the comparison trivially true.
      assert.ok(heroData, "buildHeroData returned null for the fixture");
      assert.ok(
        Object.keys(heroData).length >= 15,
        `expected a full payload, saw ${Object.keys(heroData).length} keys`
      );
    });

    test("HeroCard destructures nothing the builder does not return", () => {
      const returned = new Set(Object.keys(heroData));
      const missing = destructuredKeys(source).filter((key) => !returned.has(key));
      assert.deepEqual(
        missing,
        [],
        `HeroCard reads keys buildHeroData does not return: ${missing.join(", ")}`
      );
    });

    test("the builder returns nothing HeroCard does not read", () => {
      const destructured = new Set(destructuredKeys(source));
      const unread = Object.keys(heroData)
        .filter((key) => !destructured.has(key))
        .sort();
      assert.deepEqual(
        unread,
        [],
        "buildHeroData computes these on every render and nothing reads them: " +
          `${unread.join(", ")}. Delete them, or render them.`
      );
    });
  });
});
