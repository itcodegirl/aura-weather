import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getAlertResponseLabel } from "./alertResponse.js";

describe("getAlertResponseLabel — the signed-off vocabulary", () => {
  /*
   * Transcribed from the sign-off of 2026-09-18, recorded in the remediation
   * plan's §16. Asserted one-by-one rather than looped over the module's own
   * table, because a loop over the implementation would pass no matter what
   * the implementation said — it would test that the map equals itself.
   */
  test("maps every CAP response value to its approved label", () => {
    assert.equal(getAlertResponseLabel("Shelter"), "Take shelter");
    assert.equal(getAlertResponseLabel("Evacuate"), "Evacuate");
    assert.equal(getAlertResponseLabel("Prepare"), "Prepare");
    assert.equal(getAlertResponseLabel("Execute"), "Follow instructions");
    assert.equal(getAlertResponseLabel("Avoid"), "Avoid the area");
    assert.equal(getAlertResponseLabel("Monitor"), "Monitor conditions");
    assert.equal(getAlertResponseLabel("Assess"), "Assess the situation");
    assert.equal(getAlertResponseLabel("AllClear"), "All clear");
  });

  test("lookup is case-insensitive, so a provider casing change cannot drop the chip", () => {
    assert.equal(getAlertResponseLabel("SHELTER"), "Take shelter");
    assert.equal(getAlertResponseLabel("allclear"), "All clear");
    assert.equal(getAlertResponseLabel("  Avoid  "), "Avoid the area");
  });
});

describe("getAlertResponseLabel — when no chip should render", () => {
  /*
   * Every one of these returns null rather than a placeholder string. The
   * chip occupies the most prominent slot in the alert row; a chip reading
   * "None" or "Unknown" would spend that slot saying nothing, against the
   * card's rule that a missing answer is silence.
   */
  test("None renders no chip", () => {
    assert.equal(getAlertResponseLabel("None"), null);
    assert.equal(getAlertResponseLabel("none"), null);
  });

  test("an unrecognised token renders no chip rather than being shown raw", () => {
    assert.equal(getAlertResponseLabel("Mitigate"), null);
    assert.equal(getAlertResponseLabel("EvacuateImmediately"), null);
  });

  test("the normaliser's empty-string default renders no chip", () => {
    assert.equal(getAlertResponseLabel(""), null);
    assert.equal(getAlertResponseLabel("   "), null);
  });

  test("non-string input renders no chip rather than throwing", () => {
    assert.equal(getAlertResponseLabel(undefined), null);
    assert.equal(getAlertResponseLabel(null), null);
    assert.equal(getAlertResponseLabel(42), null);
    assert.equal(getAlertResponseLabel({}), null);
    assert.equal(getAlertResponseLabel([]), null);
  });
});

describe("getAlertResponseLabel — against the recorded live payload", () => {
  /*
   * The vocabulary is only useful if it covers what NWS actually sends. This
   * reads the recorded fixture rather than a list of values someone believed
   * the feed contained.
   */
  const recorded = JSON.parse(
    readFileSync(
      new URL("../api/__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
      "utf8"
    )
  );

  test("every response value in the recorded feed is either mapped or deliberately unmapped", () => {
    const unmapped = [];

    for (const feature of recorded.features) {
      const raw = feature.properties.response;
      if (typeof raw !== "string" || raw.trim() === "") continue;
      if (raw.trim().toLowerCase() === "none") continue;
      if (getAlertResponseLabel(raw) === null) {
        unmapped.push(raw);
      }
    }

    assert.deepEqual(
      unmapped,
      [],
      `recorded feed carried response values with no approved label: ${unmapped.join(", ")}`
    );
  });
});
