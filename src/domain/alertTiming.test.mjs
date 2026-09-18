import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ALERT_TIMING_PHRASES, describeAlertTiming } from "./alertTiming.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// A fixed clock. Nothing here reads Date.now(): a test that did would drift
// into a different bucket as the calendar moved, and take the suite with it.
const NOW = Date.parse("2026-09-18T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

/** Convenience: onset at now+lead, end at now+end. */
function timing(leadMs, endMs, { expires = null, onset } = {}) {
  return describeAlertTiming(
    onset === undefined ? iso(NOW + leadMs) : onset,
    endMs === null ? null : iso(NOW + endMs),
    expires,
    NOW
  );
}

describe("describeAlertTiming — against the recorded live payload", () => {
  /*
   * Read at the fixture's own capture instant, so the expected buckets are
   * facts about the provider's timestamps rather than about today's clock.
   */
  const recorded = JSON.parse(
    readFileSync(
      new URL("../api/__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
      "utf8"
    )
  );
  const captured = Date.parse(recorded.captured);
  const at = (event) => {
    const p = recorded.features.find((f) => f.properties.event === event).properties;
    return describeAlertTiming(p.onset ?? p.effective, p.ends, p.expires, captured);
  };

  test("a Beach Hazards Statement 7.5 hours out is pending, within 12 hours", () => {
    assert.deepEqual(at("Beach Hazards Statement"), {
      phase: "pending",
      phrase: "Starts within 12 hours",
    });
  });

  test("a Severe Thunderstorm Warning with 15 minutes left is ending within the hour", () => {
    assert.deepEqual(at("Severe Thunderstorm Warning"), {
      phase: "active",
      phrase: "Ends within the hour",
    });
  });

  test("an Air Quality Alert 20 hours from its expiry, with no ends, is simply in effect", () => {
    assert.deepEqual(at("Air Quality Alert"), {
      phase: "active",
      phrase: "In effect now",
    });
  });

  test("a Special Weather Statement with no ends is judged on its expiry, 45 minutes out", () => {
    assert.deepEqual(at("Special Weather Statement"), {
      phase: "active",
      phrase: "Ends within the hour",
    });
  });

  test("the Test Message's null onset reaches unknown when passed raw", () => {
    // Filtered upstream as a drill regardless. Passed RAW here — not through
    // the `onset ?? effective` fallback the card applies — so a JSON null is
    // proven to reach `unknown` rather than `Date.parse(null)` -> NaN.
    const p = recorded.features.find((f) => f.properties.event === "Test Message").properties;
    assert.equal(p.onset, null);
    assert.deepEqual(describeAlertTiming(p.onset, p.ends, p.expires, captured), {
      phase: "unknown",
      phrase: null,
    });
  });

  test("…and through the card's fallback it reads from effective instead", () => {
    // Same alert, resolved the way AlertsCard resolves it: `effective` is
    // seven minutes BEFORE capture and `expires` (no `ends`) three minutes
    // after, so it is already in effect and ending within the hour. The
    // values are the provider's; a first draft of this test guessed them
    // and guessed wrong.
    assert.deepEqual(at("Test Message"), {
      phase: "active",
      phrase: "Ends within the hour",
    });
  });
});

describe("describeAlertTiming — lead-time buckets", () => {
  const cases = [
    [1_000, "Starts within the hour"], // 1 second out: ceil -> 1 minute
    [59 * MIN, "Starts within the hour"],
    [60 * MIN, "Starts within the hour"], // inclusive top
    [60 * MIN + 1_000, "Starts in the next few hours"], // ceil -> 61
    [3 * HOUR, "Starts in the next few hours"],
    [6 * HOUR, "Starts in the next few hours"], // inclusive top
    [6 * HOUR + 1_000, "Starts within 12 hours"],
    [7.5 * HOUR, "Starts within 12 hours"], // the fixture's Beach Hazards lead
    [12 * HOUR, "Starts within 12 hours"],
    [12 * HOUR + 1_000, "Starts within a day"],
    [24 * HOUR, "Starts within a day"],
    [24 * HOUR + 1_000, "Starts within 2 days"],
    [48 * HOUR, "Starts within 2 days"],
    [48 * HOUR + 1_000, "Starts in more than 2 days"],
    [30 * DAY, "Starts in more than 2 days"],
  ];

  for (const [lead, phrase] of cases) {
    test(`lead ${lead / MIN} min -> "${phrase}"`, () => {
      // End a day past the onset, so no lead in the table is ever after its
      // own end — that is the `invalid` case, tested on its own below.
      assert.deepEqual(timing(lead, lead + DAY), { phase: "pending", phrase });
    });
  }

  test("no phrase ever carries a remaining-time numeral", () => {
    // The bucket BOUNDS are numbers; the remaining time never is. Sweep the
    // measured range at a coarse step and check every phrase is approved.
    for (let lead = MIN; lead <= 5 * DAY; lead += 7 * MIN) {
      const { phase, phrase } = timing(lead, 6 * DAY);
      assert.equal(phase, "pending");
      assert.ok(ALERT_TIMING_PHRASES.includes(phrase), `unapproved phrase: ${phrase}`);
      assert.doesNotMatch(phrase, /-\d|\d+ ?min/, `looks like a countdown: ${phrase}`);
    }
  });

  test("a future onset with no resolvable end is still pending — the start is known", () => {
    assert.deepEqual(timing(3 * HOUR, null), {
      phase: "pending",
      phrase: "Starts in the next few hours",
    });
  });
});

describe("describeAlertTiming — active and ended", () => {
  test("onset exactly now is in effect, not a zero-minute countdown", () => {
    assert.deepEqual(timing(0, 3 * HOUR), { phase: "active", phrase: "In effect now" });
  });

  test("onset one second ahead is pending, not already in effect", () => {
    assert.equal(timing(1_000, 3 * HOUR).phase, "pending");
  });

  test("inside the last hour it reads as ending within the hour", () => {
    assert.deepEqual(timing(-2 * HOUR, 60 * MIN), {
      phase: "active",
      phrase: "Ends within the hour",
    });
    assert.deepEqual(timing(-2 * HOUR, 1), {
      phase: "active",
      phrase: "Ends within the hour",
    });
  });

  test("one second past the last hour it is simply in effect", () => {
    assert.deepEqual(timing(-2 * HOUR, 60 * MIN + 1_000), {
      phase: "active",
      phrase: "In effect now",
    });
  });

  test("an end exactly now has ended — exclusive, matching isAlertActive", () => {
    assert.deepEqual(timing(-2 * HOUR, 0), { phase: "ended", phrase: null });
  });

  test("an end in the past has ended, with no phrase", () => {
    assert.deepEqual(timing(-5 * HOUR, -1 * HOUR), { phase: "ended", phrase: null });
  });

  test("the end falls back to expires when ends is absent, like the filter", () => {
    assert.deepEqual(timing(-2 * HOUR, null, { expires: iso(NOW + 30 * MIN) }), {
      phase: "active",
      phrase: "Ends within the hour",
    });
  });

  test("a past onset with no resolvable end is unknown — active and ended cannot be told apart", () => {
    assert.deepEqual(timing(-2 * HOUR, null), { phase: "unknown", phrase: null });
  });
});

describe("describeAlertTiming — the malformed case is onset after ends", () => {
  test("an onset after its own end is invalid, whether both are ahead of now", () => {
    assert.deepEqual(timing(5 * HOUR, 2 * HOUR), { phase: "invalid", phrase: null });
  });

  test("…or both behind it — malformed wins over ended", () => {
    assert.deepEqual(timing(-1 * HOUR, -3 * HOUR), { phase: "invalid", phrase: null });
  });

  test("…or straddling now — malformed wins over active", () => {
    assert.deepEqual(timing(1 * HOUR, -1 * HOUR), { phase: "invalid", phrase: null });
  });

  test("onset equal to end is not malformed; it is a zero-length window that has ended", () => {
    assert.deepEqual(timing(-1 * HOUR, -1 * HOUR), { phase: "ended", phrase: null });
  });

  /*
   * expires before onset is NOT malformed. It is a message deadline falling
   * before the weather it describes — 99 of 243 live alerts. It never reaches
   * the comparison because `ends` is resolved first.
   */
  test("expires before onset is normal when ends is present, and reads as pending", () => {
    assert.deepEqual(
      describeAlertTiming(iso(NOW + 7 * HOUR), iso(NOW + 17 * HOUR), iso(NOW - 1 * HOUR), NOW),
      { phase: "pending", phrase: "Starts within 12 hours" }
    );
  });

  test("expires before onset with NO ends is the one case that is genuinely inconsistent", () => {
    // Only `expires` to resolve the end from, and it precedes the start.
    assert.deepEqual(
      describeAlertTiming(iso(NOW + 7 * HOUR), null, iso(NOW - 1 * HOUR), NOW),
      { phase: "invalid", phrase: null }
    );
  });
});

describe("describeAlertTiming — missing and unusable input stays silent", () => {
  const silent = { phase: "unknown", phrase: null };

  test("no onset yields no phrase", () => {
    for (const onset of [null, undefined, "", "   "]) {
      assert.deepEqual(describeAlertTiming(onset, iso(NOW + HOUR), null, NOW), silent, String(onset));
    }
  });

  test("an unparseable onset is missing data, not epoch zero", () => {
    // Date.parse("not a date") is NaN; a naive `new Date(NaN) <= now` is
    // false, which would have quietly read as pending with a garbage bucket.
    assert.deepEqual(describeAlertTiming("not a date", iso(NOW + HOUR), null, NOW), silent);
  });

  test("non-string onset values do not throw and yield no phrase", () => {
    for (const onset of [1789698609000, {}, [], true]) {
      assert.deepEqual(describeAlertTiming(onset, iso(NOW + HOUR), null, NOW), silent);
    }
  });

  test("a non-finite clock yields no phrase rather than a nonsense one", () => {
    for (const clock of [NaN, undefined, null, Infinity, "now"]) {
      assert.deepEqual(describeAlertTiming(iso(NOW + HOUR), iso(NOW + 2 * HOUR), null, clock), silent);
    }
  });

  test("an unparseable end is treated as no end", () => {
    // Future onset: still pending. Past onset: unknown.
    assert.equal(timing(2 * HOUR, null, { expires: "garbage" }).phase, "pending");
    assert.deepEqual(describeAlertTiming(iso(NOW - HOUR), "garbage", null, NOW), silent);
  });

  test("the result never contains a negative or a countdown, for any input", () => {
    const inputs = [
      [iso(NOW - 3 * DAY), iso(NOW - 2 * DAY), null],
      [iso(NOW + 3 * DAY), iso(NOW - 2 * DAY), null],
      [iso(NOW - 1), iso(NOW + 1), null],
      ["", "", ""],
    ];
    for (const [o, e, x] of inputs) {
      const { phrase } = describeAlertTiming(o, e, x, NOW);
      assert.ok(phrase === null || ALERT_TIMING_PHRASES.includes(phrase));
    }
  });
});
