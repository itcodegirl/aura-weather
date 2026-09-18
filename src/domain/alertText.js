/**
 * Paragraph handling for National Weather Service alert prose.
 *
 * NWS ships `instruction` and `description` hard-wrapped at roughly 70
 * columns, which makes a bare newline ambiguous: inside a sentence it is a
 * wrap, and doubled it is a real paragraph break. Measured against the
 * active feed on 2026-09-17 (205 features, 122 carrying an instruction):
 * 116 instructions contained single hard-wrap newlines and 36 contained
 * blank-line breaks, so both forms occur, usually in the same string.
 *
 * Getting this wrong is visible either way. Splitting on every newline cuts
 * sentences mid-clause — the live Severe Thunderstorm Warning text breaks
 * after "stay away from", so paragraph-per-line renders "windows." as its
 * own paragraph. Collapsing every newline instead runs three genuinely
 * separate instructions into one wall of text.
 *
 * So: a blank line separates paragraphs, and a single newline inside one
 * collapses to a space.
 */

/**
 * Splits NWS alert prose into display paragraphs.
 * @param {unknown} text Raw provider string, or anything else.
 * @returns {string[]} Paragraphs, never containing a newline. Empty for a
 *   non-string, an empty string, or whitespace-only input — the caller
 *   renders nothing rather than an empty element.
 */
export function toAlertParagraphs(text) {
  if (typeof text !== "string") {
    return [];
  }

  return text
    .split(/\n[ \t]*\n+/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter((block) => block.length > 0);
}
