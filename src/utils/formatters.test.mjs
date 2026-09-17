import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  DISPLAY_LOCALE,
  ISO_DATE_LOCALE,
  PARTS_LOCALE,
  formatClockHour,
  formatClockTime,
  formatInZone,
  formatMonthDay,
  formatStamp,
  formatWeekdayShort,
  formattersInternals,
} from "./formatters.js";

// 2026-04-18 19:30 UTC. Chicago is on CDT (UTC-5) by mid-April and Tokyo
// (UTC+9) has no DST, so both sides of this instant are stable: 2:30 PM on
// the 18th in Chicago, 4:30 AM on the 19th in Tokyo.
const INSTANT = new Date(Date.UTC(2026, 3, 18, 19, 30));
const CHICAGO = "America/Chicago";
const TOKYO = "Asia/Tokyo";

const MODULE_URL = new URL("./formatters.js", import.meta.url).href;

/**
 * Runs `source` in a child node process whose default locale is `locale`.
 *
 * The bug this module fixes only appears on a machine that is not already
 * en-US, so a test running in the repo's own en-US runtime cannot see it:
 * the broken call sites and the fixed ones produce identical strings here.
 * Forcing the default locale is the only way to tell them apart.
 */
function runWithDefaultLocale(locale, source) {
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    env: { ...process.env, LC_ALL: locale, LANG: locale },
    encoding: "utf8",
  }).trim();
}

describe("formatters", () => {
  describe("the locale has one home", () => {
    test("display and machine locales are separate constants", () => {
      // The display locale is a product decision; the other two are chosen
      // for their output shape and must not follow it. Separate exports are
      // what stops a future change to one from silently moving the others.
      assert.equal(DISPLAY_LOCALE, "en-US");
      assert.equal(ISO_DATE_LOCALE, "en-CA");
      assert.equal(PARTS_LOCALE, "en-US");
    });

    test("ISO_DATE_LOCALE renders YYYY-MM-DD, which is why it is not en-US", () => {
      const rendered = new Intl.DateTimeFormat(ISO_DATE_LOCALE, {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(INSTANT);
      assert.equal(rendered, "2026-04-18");
    });

    test("PARTS_LOCALE yields zero-padded numeric parts", () => {
      const parts = new Intl.DateTimeFormat(PARTS_LOCALE, {
        timeZone: CHICAGO,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(INSTANT);
      const lookup = Object.fromEntries(
        parts.map((part) => [part.type, part.value])
      );
      assert.equal(lookup.year, "2026");
      assert.equal(lookup.month, "04");
      assert.equal(lookup.day, "18");
      assert.equal(lookup.hour, "14");
    });
  });

  describe("shapes", () => {
    test("each formatter renders its documented shape", () => {
      assert.equal(formatClockHour(INSTANT, CHICAGO), "2 PM");
      assert.equal(formatClockTime(INSTANT, CHICAGO), "2:30 PM");
      assert.equal(formatMonthDay(INSTANT, CHICAGO), "Apr 18");
      assert.equal(formatWeekdayShort(INSTANT, CHICAGO), "Sat");
      assert.equal(formatStamp(INSTANT, CHICAGO), "Apr 18, 2:30 PM");
    });

    test("the zone decides the reading, not the runtime", () => {
      assert.equal(formatClockTime(INSTANT, TOKYO), "4:30 AM");
      // Same instant, next calendar day in Tokyo.
      assert.equal(formatMonthDay(INSTANT, TOKYO), "Apr 19");
    });
  });

  describe("formatInZone", () => {
    test("an unknown IANA name falls back to the viewer's clock", () => {
      // The zone comes from the weather provider, and Intl throws a
      // RangeError on a name the runtime does not carry. Asserted against
      // the no-zone result rather than a literal, because the viewer's
      // clock is whatever machine runs the test.
      const options = { hour: "numeric", minute: "2-digit", hour12: true };
      assert.equal(
        formatInZone(INSTANT, options, "Not/AZone"),
        formatInZone(INSTANT, options)
      );
    });

    test("a blank or non-string zone is treated as absent", () => {
      const options = { hour: "numeric", hour12: true };
      const viewer = formatInZone(INSTANT, options);
      assert.equal(formatInZone(INSTANT, options, "   "), viewer);
      assert.equal(formatInZone(INSTANT, options, null), viewer);
      assert.equal(formatInZone(INSTANT, options, 42), viewer);
    });

    test("an unusable date renders nothing rather than 'Invalid Date'", () => {
      assert.equal(formatClockTime(new Date("not-a-date")), "");
      assert.equal(formatClockTime("2026-04-18T19:30"), "");
      assert.equal(formatClockTime(null), "");
      assert.equal(formatClockTime(undefined), "");
      assert.equal(formatStamp(1776123000000), "");
    });
  });

  describe("formatter cache", () => {
    test("the same options and zone reuse one Intl instance", () => {
      formattersInternals.resetCache();
      formatClockTime(INSTANT, CHICAGO);
      formatClockTime(new Date(Date.UTC(2026, 5, 1, 0, 0)), CHICAGO);
      assert.equal(formattersInternals.formatterCache.size, 1);
    });

    test("a different zone or shape is a different instance", () => {
      formattersInternals.resetCache();
      formatClockTime(INSTANT, CHICAGO);
      formatClockTime(INSTANT, TOKYO);
      formatMonthDay(INSTANT, CHICAGO);
      assert.equal(formattersInternals.formatterCache.size, 3);
    });

    test("a rejected zone does not poison the cache", () => {
      // The bad zone throws inside the constructor. If the attempt were
      // cached, the next caller asking for that key would get a broken or
      // wrong formatter; instead only the viewer-clock fallback is stored.
      formattersInternals.resetCache();
      const fallback = formatClockTime(INSTANT, "Not/AZone");
      assert.equal(formattersInternals.formatterCache.size, 1);
      assert.equal(formatClockTime(INSTANT), fallback);
      assert.equal(formattersInternals.formatterCache.size, 1);
      assert.equal(formatClockTime(INSTANT, CHICAGO), "2:30 PM");
    });
  });

  describe("independence from the runtime locale", () => {
    // This is the regression test for the finding. Before this module, the
    // trust footer, the status stack, the sync panel and the "Last updated"
    // tooltip passed no locale, so a reader outside the US saw their own
    // date format inside English copy while the hero beside it read en-US.
    test("a de-DE runtime still renders the en-US display locale", () => {
      const output = runWithDefaultLocale(
        "de-DE",
        `
        import { formatStamp, formatClockTime } from ${JSON.stringify(MODULE_URL)};
        const d = new Date(Date.UTC(2026, 3, 18, 19, 30));
        const z = "America/Chicago";
        // Positive control: prove the child's default really is de-DE, so a
        // pass cannot come from the environment variable being ignored.
        const uncontrolled = d.toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric",
          minute: "2-digit", timeZone: z,
        });
        console.log(JSON.stringify({
          runtimeDefault: new Intl.DateTimeFormat().resolvedOptions().locale,
          uncontrolled,
          stamp: formatStamp(d, z),
          clock: formatClockTime(d, z),
        }));
        `
      );
      const result = JSON.parse(output);

      assert.equal(result.runtimeDefault, "de-DE");
      assert.notEqual(result.uncontrolled, "Apr 18, 2:30 PM");

      assert.equal(result.stamp, "Apr 18, 2:30 PM");
      assert.equal(result.clock, "2:30 PM");
    });
  });
});
