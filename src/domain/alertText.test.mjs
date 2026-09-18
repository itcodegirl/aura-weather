import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { toAlertParagraphs } from "./alertText.js";

/*
 * The strings below are verbatim from the NWS active feed on 2026-09-17,
 * trimmed in length but not reflowed: their newlines sit exactly where the
 * provider put them. Paraphrasing them would test the shape this module
 * expects rather than the shape it receives.
 */
const LIVE_SEVERE_THUNDERSTORM =
  "Seek shelter inside a well-built structure and stay away from\nwindows. This storm is capable of producing damaging winds and large\nhail.";

const LIVE_FLOOD_ADVISORY =
  "Turn around, don't drown when encountering flooded roads. Most flood\ndeaths occur in vehicles.\n\nIn hilly or mountainous terrain there are numerous low water\ncrossings which are potentially dangerous in heavy rain.";

describe("toAlertParagraphs — hard wraps vs paragraph breaks", () => {
  test("a hard-wrapped sentence stays one paragraph", () => {
    const result = toAlertParagraphs(LIVE_SEVERE_THUNDERSTORM);

    assert.equal(result.length, 1);
    // The provider wrapped after "away from"; splitting there would strand
    // "windows." as its own paragraph. This is the whole point of the module.
    assert.match(result[0], /stay away from windows\./);
    assert.ok(!result[0].includes("\n"));
  });

  test("a blank line starts a new paragraph", () => {
    const result = toAlertParagraphs(LIVE_FLOOD_ADVISORY);

    assert.equal(result.length, 2);
    assert.match(result[0], /^Turn around/);
    assert.match(result[1], /^In hilly or mountainous terrain/);
    assert.ok(result.every((paragraph) => !paragraph.includes("\n")));
  });

  test("hard wraps inside a paragraph collapse to single spaces", () => {
    const result = toAlertParagraphs(LIVE_FLOOD_ADVISORY);

    assert.ok(!result.some((paragraph) => /\s{2,}/.test(paragraph)));
    assert.match(result[0], /Most flood deaths occur in vehicles\./);
  });

  test("several blank lines still separate exactly one paragraph boundary", () => {
    const result = toAlertParagraphs("First block.\n\n\n\nSecond block.");

    assert.deepEqual(result, ["First block.", "Second block."]);
  });

  test("a blank line carrying whitespace is still a paragraph break", () => {
    const result = toAlertParagraphs("First block.\n \t \nSecond block.");

    assert.deepEqual(result, ["First block.", "Second block."]);
  });
});

describe("toAlertParagraphs — absent and unusable input", () => {
  /*
   * Each of these must yield an empty array rather than `[""]`: the card
   * renders one <p> per entry, so a single empty string would emit an
   * empty paragraph — a visible gap asserting that the provider said
   * something when it said nothing.
   */
  test("an absent instruction yields no paragraphs", () => {
    assert.deepEqual(toAlertParagraphs(undefined), []);
    assert.deepEqual(toAlertParagraphs(null), []);
  });

  test("the normaliser's empty-string default yields no paragraphs", () => {
    assert.deepEqual(toAlertParagraphs(""), []);
  });

  test("whitespace-only prose yields no paragraphs", () => {
    assert.deepEqual(toAlertParagraphs("   \n\n  \t "), []);
  });

  test("non-string input yields no paragraphs rather than throwing", () => {
    assert.deepEqual(toAlertParagraphs(42), []);
    assert.deepEqual(toAlertParagraphs({}), []);
    assert.deepEqual(toAlertParagraphs([]), []);
    assert.deepEqual(toAlertParagraphs(true), []);
  });
});
