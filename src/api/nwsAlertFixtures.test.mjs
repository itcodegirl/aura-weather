import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Responses recorded from the live NWS alerts endpoint on 2026-09-18, with
 * the exact requests `fetchSevereWeatherAlerts` builds: the national
 * `alerts/active` feed, and a `?point=` query for Palos Hills, IL (the app's
 * default city). Trimmed to a handful of features; every retained feature is
 * verbatim, including its prose and its geometry.
 *
 * Why these exist. Every alert fixture in this repo was hand-written, so the
 * normaliser was only ever tested against the shapes someone remembered to
 * invent. That is exactly how the field projection went stale unnoticed:
 * `instruction` was absent from the model for as long as nobody wrote a
 * fixture carrying one. Recorded payloads make the provider, not our memory,
 * the source of shapes.
 *
 * Re-record by re-running both requests and re-trimming. Keep the retained
 * features verbatim: the wrapping and the punctuation are the data under
 * test, not incidental formatting.
 *
 * ── A correction to the plan this ticket came from ────────────────────────
 *
 * The ticket asked for "all four instruction±geometry quadrants". Only three
 * of them exist. Measured across two independent captures six hours apart —
 * 2026-09-17T20:38Z (205 features) and 2026-09-18T02:30Z (244 features) —
 * the geometry-without-instruction quadrant was EMPTY in both:
 *
 *   capture            instr+geom   instr only   geom only   neither
 *   2026-09-17T20:38Z      35           87           0          83
 *   2026-09-18T02:30Z      36           96           0         112
 *
 * So a polygon-carrying alert always carried protective-action text. That is
 * a fact about the feed worth holding onto rather than papering over, and it
 * is asserted below: if NWS ever issues a polygon without an instruction,
 * `no alert carries geometry without an instruction` fails and the assumption
 * gets revisited instead of silently outliving its evidence.
 *
 * Two captures is not a season. This is not claimed as a guarantee — it is
 * claimed as what was observed, with the observation pinned so a change to it
 * is loud.
 */

const active = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
    "utf8"
  )
);

const point = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/nws-alerts-point.recorded.json", import.meta.url),
    "utf8"
  )
);

function hasInstruction(feature) {
  const instruction = feature?.properties?.instruction;
  return typeof instruction === "string" && instruction.trim() !== "";
}

function hasGeometry(feature) {
  return Boolean(feature?.geometry);
}

describe("recorded NWS alert fixtures — provenance", () => {
  test("both fixtures record when and where they came from", () => {
    for (const [name, fixture] of [["active", active], ["point", point]]) {
      assert.match(
        fixture.captured,
        /^\d{4}-\d{2}-\d{2}T/,
        `${name} fixture must carry an ISO capture date`
      );
      assert.match(
        fixture.source,
        /^https:\/\/api\.weather\.gov\/alerts\/active/,
        `${name} fixture must name the endpoint it came from`
      );
    }
  });

  test("this suite leaves the real fetch in place", () => {
    /*
     * The fixtures load from disk at module import, so this suite is
     * deterministic whether or not NWS is reachable. The risk worth pinning
     * is the other direction: sibling suites in this file's directory stub
     * `globalThis.fetch` and restore it in `afterEach`, and a fixture suite
     * that quietly replaced it would leak that stub into whatever ran next.
     *
     * A first draft of this test scanned its own source for an assignment to
     * `globalThis.fetch` and failed on the assertion's own text. Checking the
     * property rather than the prose is both correct and harder to fool.
     */
    assert.equal(typeof globalThis.fetch, "function");
    assert.ok(
      !Object.prototype.hasOwnProperty.call(
        globalThis.fetch,
        "__stubbedByFixtureSuite"
      )
    );
  });
});

describe("recorded NWS alert fixtures — shape coverage", () => {
  test("carries an alert with both an instruction and a polygon", () => {
    const covered = active.features.filter(
      (feature) => hasInstruction(feature) && hasGeometry(feature)
    );

    assert.ok(covered.length > 0);
    // The highest-consequence combination, so it is pinned specifically
    // rather than left to whichever feature happens to sort first.
    assert.ok(
      covered.some((feature) => feature.properties.urgency === "Immediate"),
      "expected at least one urgency=Immediate alert with instruction and geometry"
    );
  });

  test("carries an alert with an instruction and no polygon", () => {
    assert.ok(
      active.features.some(
        (feature) => hasInstruction(feature) && !hasGeometry(feature)
      )
    );
  });

  test("carries an alert with neither an instruction nor a polygon", () => {
    assert.ok(
      active.features.some(
        (feature) => !hasInstruction(feature) && !hasGeometry(feature)
      )
    );
  });

  /*
   * The fourth quadrant the ticket asked for. It is asserted ABSENT, not
   * present, because the feed does not produce it — see the header. This is
   * the tripwire: a failure here is news, not a broken test.
   */
  test("no alert carries geometry without an instruction (observed, not guaranteed)", () => {
    const geometryOnly = active.features.filter(
      (feature) => hasGeometry(feature) && !hasInstruction(feature)
    );

    assert.deepEqual(
      geometryOnly.map((feature) => feature.properties.event),
      [],
      "NWS issued a polygon-bearing alert with no protective-action text — re-read the fixture header, this was empty across two captures"
    );
  });

  test("carries a non-Actual transmission, so the drill filter has a real case", () => {
    const drills = active.features.filter(
      (feature) => feature.properties.status !== "Actual"
    );

    assert.ok(drills.length > 0);
    assert.equal(drills[0].properties.status, "Test");
  });

  test("carries an instruction with a blank-line paragraph break", () => {
    // NWS hard-wraps at ~70 columns, so a single newline is a wrap and a
    // blank line is a paragraph. Both forms must be represented or
    // alertText's split has nothing real to be tested against.
    assert.ok(
      active.features.some((feature) =>
        /\n[ \t]*\n/.test(feature.properties.instruction || "")
      )
    );
    assert.ok(
      active.features.some((feature) =>
        /[^\n]\n[^\n]/.test(feature.properties.instruction || "")
      )
    );
  });

  test("every retained geometry is a Polygon, as observed", () => {
    for (const feature of active.features.filter(hasGeometry)) {
      assert.equal(feature.geometry.type, "Polygon");
      assert.ok(Array.isArray(feature.geometry.coordinates[0]));
      assert.ok(feature.geometry.coordinates[0].length >= 4);
    }
  });
});

describe("recorded NWS alert fixtures — the point response", () => {
  /*
   * The app's own default city, and the degraded case in the wild: a single
   * low-consequence product with no polygon and no protective action. Worth
   * a recorded fixture precisely because it is the shape a synthetic test
   * would never think to write.
   */
  test("is the Palos Hills degraded case — no geometry, no instruction", () => {
    assert.equal(point.features.length, 1);

    const [feature] = point.features;
    assert.equal(hasGeometry(feature), false);
    assert.equal(hasInstruction(feature), false);
    assert.equal(feature.properties.status, "Actual");
  });
});
