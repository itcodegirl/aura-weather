import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatLastUpdatedLabel,
  formatTimestampTitle,
  getAgeMinutes,
} from "./dataTrust.js";

describe("getAgeMinutes", () => {
  test("returns minutes since the given timestamp", () => {
    const now = 1_700_000_000_000;
    assert.equal(getAgeMinutes(now - 5 * 60_000, now), 5);
    assert.equal(getAgeMinutes(now - 65 * 60_000, now), 65);
  });

  test("clamps negative ages to zero", () => {
    const now = 1_700_000_000_000;
    assert.equal(getAgeMinutes(now + 30_000, now), 0);
  });

  test("returns null when lastUpdatedAt is missing", () => {
    // The bug we are guarding against: Number(null) is 0, so without
    // strict coercion this would compute "minutes since the epoch"
    // and the UI would render a misleading "Stale data" warning
    // before any data has loaded.
    const now = 1_700_000_000_000;
    assert.equal(getAgeMinutes(null, now), null);
    assert.equal(getAgeMinutes(undefined, now), null);
    assert.equal(getAgeMinutes("", now), null);
  });

  test("returns null when nowMs is explicitly null", () => {
    // Note: passing undefined would trigger the Date.now() default
    // parameter, so the missing-clock guard only fires for explicit
    // null/non-numeric values.
    assert.equal(getAgeMinutes(1_700_000_000_000, null), null);
    assert.equal(getAgeMinutes(1_700_000_000_000, "not-a-time"), null);
  });
});

describe("formatLastUpdatedLabel", () => {
  test("returns 'Update pending' for missing timestamps", () => {
    assert.equal(formatLastUpdatedLabel(null, Date.now()), "Update pending");
    assert.equal(formatLastUpdatedLabel(undefined, Date.now()), "Update pending");
  });

  test("uses 'just now' under one minute", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatLastUpdatedLabel(now - 30_000, now), "Updated just now");
  });

  test("uses minute label under an hour", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatLastUpdatedLabel(now - 12 * 60_000, now), "Updated 12m ago");
  });

  test("uses hour label at the hour mark", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatLastUpdatedLabel(now - 60 * 60_000, now), "Updated 1h ago");
    assert.equal(formatLastUpdatedLabel(now - 180 * 60_000, now), "Updated 3h ago");
  });

  test("uses h+m label between hour marks", () => {
    const now = 1_700_000_000_000;
    assert.equal(formatLastUpdatedLabel(now - 75 * 60_000, now), "Updated 1h 15m ago");
  });
});

describe("formatTimestampTitle", () => {
  test("returns the no-data string when timestamp is missing", () => {
    assert.equal(formatTimestampTitle(null), "No successful update yet");
    assert.equal(formatTimestampTitle(undefined), "No successful update yet");
    assert.equal(formatTimestampTitle("not-a-number"), "No successful update yet");
  });

  test("returns a localized 'Last updated ...' string for valid input", () => {
    const formatted = formatTimestampTitle(1_700_000_000_000);
    assert.ok(formatted.startsWith("Last updated "));
  });
});
