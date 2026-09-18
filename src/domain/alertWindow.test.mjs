import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isAlertActive, resolveAlertEnd } from "./alertWindow.js";

/*
 * The regression this file exists for.
 *
 * Both expiry filters keyed on CAP `expires`, which is when the MESSAGE must
 * be reissued, not when the HAZARD ends. Measured on the live feed
 * 2026-09-18: `ends` differed from `expires` on 184 of 243 active alerts, 99
 * had `expires` earlier than their own `onset`, and 8 of the 136 future-onset
 * alerts were dropped from the card while their hazard was still ahead of them.
 *
 * The recorded fixture carries the shape verbatim. The Beach Hazards Statement
 * below has onset 05:00, expires 05:30 and ends 15:00 — so for the nine and a
 * half hours between its expiry and its end, the old rule hid it.
 */
const recorded = JSON.parse(
  readFileSync(
    new URL("../api/__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
    "utf8"
  )
);

/** Mirrors the normaliser's field split, so these tests read real provider values. */
function normalise(feature) {
  const p = feature.properties;
  return {
    event: p.event,
    onsetAt: typeof p.onset === "string" ? p.onset : null,
    endsAt: typeof p.ends === "string" ? p.ends : null,
    expiresAt: typeof p.expires === "string" ? p.expires : null,
  };
}

const byEvent = Object.fromEntries(
  recorded.features.map((f) => [f.properties.event, normalise(f)])
);

describe("resolveAlertEnd — which timestamp ends an alert", () => {
  test("prefers the hazard end over the message expiry", () => {
    const beach = byEvent["Beach Hazards Statement"];
    assert.ok(beach, "fixture must carry the ends-after-expires case");

    assert.equal(resolveAlertEnd(beach), beach.endsAt);
    assert.notEqual(beach.endsAt, beach.expiresAt);
    // The whole point: ends is materially later, not a rounding difference.
    assert.ok(Date.parse(beach.endsAt) > Date.parse(beach.expiresAt));
  });

  test("falls back to the message expiry when the provider sends no ends", () => {
    const statement = byEvent["Special Weather Statement"];
    assert.ok(statement, "fixture must carry an alert with no `ends`");
    assert.equal(statement.endsAt, null);

    // Old behaviour, preserved exactly. This change cannot shorten the window
    // for an alert carrying no `ends`.
    assert.equal(resolveAlertEnd(statement), statement.expiresAt);
  });

  test("returns null when neither timestamp is usable", () => {
    assert.equal(resolveAlertEnd({ endsAt: null, expiresAt: null }), null);
    assert.equal(resolveAlertEnd({}), null);
    assert.equal(resolveAlertEnd(null), null);
    assert.equal(resolveAlertEnd(undefined), null);
  });

  test("treats an empty string as absent rather than as a timestamp", () => {
    assert.equal(resolveAlertEnd({ endsAt: "", expiresAt: "2026-09-18T15:00:00Z" }),
      "2026-09-18T15:00:00Z");
    assert.equal(resolveAlertEnd({ endsAt: "", expiresAt: "" }), null);
  });

  test("ignores non-string values rather than passing them through", () => {
    assert.equal(resolveAlertEnd({ endsAt: 1789, expiresAt: "2026-09-18T15:00:00Z" }),
      "2026-09-18T15:00:00Z");
    assert.equal(resolveAlertEnd({ endsAt: {}, expiresAt: [] }), null);
  });
});

describe("isAlertActive — the regression", () => {
  /*
   * The exact defect, driven by the real fixture values. At an instant after
   * the message expired and before the hazard ends, the alert MUST still be
   * active. Keying on `expires` returned false here and the card went blank.
   */
  test("keeps a future-onset alert after its message expiry but before its hazard end", () => {
    const beach = byEvent["Beach Hazards Statement"];
    const expired = Date.parse(beach.expiresAt);
    const ends = Date.parse(beach.endsAt);
    const midway = expired + Math.floor((ends - expired) / 2);

    assert.ok(midway > expired, "test instant must be past the message expiry");
    assert.ok(midway < ends, "test instant must be before the hazard end");

    assert.equal(isAlertActive(beach, midway), true);
    // And the old rule, spelled out, to show what changed.
    assert.equal(Date.parse(beach.expiresAt) > midway, false);
  });

  test("still drops the alert once its hazard end has passed", () => {
    const beach = byEvent["Beach Hazards Statement"];
    assert.equal(isAlertActive(beach, Date.parse(beach.endsAt) + 1), false);
  });

  test("is exclusive at the boundary — an alert ending exactly now is not active", () => {
    const beach = byEvent["Beach Hazards Statement"];
    assert.equal(isAlertActive(beach, Date.parse(beach.endsAt)), false);
    assert.equal(isAlertActive(beach, Date.parse(beach.endsAt) - 1), true);
  });

  test("an alert with no ends is judged on its expiry, exactly as before", () => {
    const statement = byEvent["Special Weather Statement"];
    const expires = Date.parse(statement.expiresAt);

    assert.equal(isAlertActive(statement, expires - 1), true);
    assert.equal(isAlertActive(statement, expires + 1), false);
  });

  test("an alert whose ends equals its expires behaves identically either way", () => {
    const storm = byEvent["Severe Thunderstorm Warning"];
    assert.equal(storm.endsAt, storm.expiresAt);

    const end = Date.parse(storm.endsAt);
    assert.equal(isAlertActive(storm, end - 1), true);
    assert.equal(isAlertActive(storm, end + 1), false);
  });
});

describe("isAlertActive — undatable input stays dropped", () => {
  /*
   * Deliberately unchanged from the old behaviour. The card would rather drop
   * an alert it cannot date than present one whose window it cannot vouch for,
   * and this change is about reading the right field, not about loosening that.
   */
  test("an alert with neither timestamp is not active", () => {
    assert.equal(isAlertActive({ endsAt: null, expiresAt: null }, 1_000), false);
  });

  test("an unparseable timestamp is not active", () => {
    assert.equal(isAlertActive({ endsAt: "not a date" }, 1_000), false);
    assert.equal(isAlertActive({ endsAt: "", expiresAt: "also not a date" }, 1_000), false);
  });

  test("a malformed ends does not fall through to a valid expires", () => {
    // `ends` is present and a string, so it is the answer — and it is garbage.
    // Falling back here would mean a provider typo silently changed which
    // field the app trusts, which is the class of bug this module exists for.
    assert.equal(
      isAlertActive({ endsAt: "not a date", expiresAt: "2999-01-01T00:00:00Z" }, 1_000),
      false
    );
  });

  test("null and undefined alerts are not active", () => {
    assert.equal(isAlertActive(null, 1_000), false);
    assert.equal(isAlertActive(undefined, 1_000), false);
  });
});
