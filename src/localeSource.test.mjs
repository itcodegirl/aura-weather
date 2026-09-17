import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The locale is a product decision, and it has one home: `utils/formatters.js`.
 *
 * It did not, before. `en-US` was hardcoded at 15 display call sites, and four
 * more — the trust footer (twice), the status stack, the sync panel and the
 * "Last updated" tooltip — named no locale at all and rendered in whatever the
 * browser was set to. On a German machine the footer read "18. Apr., 19:30"
 * while the hero beside it read "7:30 PM", inside English copy.
 *
 * Nothing caught that, and nothing could: on an en-US machine the broken call
 * sites and the correct ones print identical strings, so every test passed and
 * every review read fine. This is the gate that makes the rule real.
 *
 * What it forbids: formatting for display without naming a locale, anywhere
 * but in the formatters module. A runtime-default locale is the specific
 * defect — `toLocaleString()`, `toLocaleTimeString([])`,
 * `toLocaleDateString(undefined, …)`, `new Intl.DateTimeFormat({ … })`.
 *
 * Scope, stated honestly: this leg covers the runtime-default forms only. The
 * remaining hardcoded `en-US` literals in the component and api layers are
 * being routed through the module in a follow-up, and this file gains the
 * literal rule with them. A gate that lands half a rule and says so beats one
 * that waits for the whole sweep and enforces nothing in the meantime.
 */

const SRC = fileURLToPath(new URL(".", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SOURCE_EXTENSIONS = [".js", ".jsx"];

// The module that is allowed to decide a locale, because deciding it is the
// module's whole job.
const LOCALE_OWNER = "utils/formatters.js";

/*
 * A locale argument that resolves to "whatever this machine is set to":
 * omitted entirely, `undefined`, `null`, an empty array, or — for an Intl
 * constructor — an options object where the locale should be.
 */
const RUNTIME_DEFAULT_TO_LOCALE =
  /\.toLocale(?:String|TimeString|DateString)\(\s*(?:\)|undefined\b|null\b|\[\s*\])/g;
const RUNTIME_DEFAULT_INTL = /new\s+Intl\.[A-Za-z]+\(\s*(?:\)|\{|undefined\b|null\b|\[\s*\])/g;

function collectSourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
      continue;
    }
    if (
      SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)) &&
      !entry.includes(".test.")
    ) {
      found.push(full);
    }
  }
  return found;
}

function runtimeDefaultLocalesIn(source) {
  const hits = [];
  for (const pattern of [RUNTIME_DEFAULT_TO_LOCALE, RUNTIME_DEFAULT_INTL]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      hits.push({ line, snippet: match[0].replace(/\s+/g, " ") });
    }
  }
  return hits;
}

/**
 * Strips `//` and block comments so prose describing the forbidden pattern —
 * this file's own header, for one — does not read as a violation.
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the display locale has one home", () => {
  test("the detector recognises a runtime-default locale", () => {
    // Positive control. Without this, a regex that silently matched nothing
    // would report a clean tree forever — which is exactly how the original
    // defect survived: absence of evidence read as evidence of absence.
    const offenders = [
      "const s = d.toLocaleString();",
      "const s = d.toLocaleString([], { hour: 'numeric' });",
      "const s = d.toLocaleTimeString(undefined, { hour: 'numeric' });",
      "const s = d.toLocaleDateString(null);",
      "const f = new Intl.DateTimeFormat({ month: 'short' });",
      "const f = new Intl.NumberFormat();",
    ];
    for (const offender of offenders) {
      assert.equal(
        runtimeDefaultLocalesIn(offender).length,
        1,
        `should flag: ${offender}`
      );
    }
  });

  test("the detector accepts a named locale", () => {
    const allowed = [
      'const s = d.toLocaleString("en-US", { hour: "numeric" });',
      'const s = d.toLocaleTimeString(DISPLAY_LOCALE, CLOCK_OPTIONS);',
      'const f = new Intl.DateTimeFormat(PARTS_LOCALE, { timeZone });',
      'const f = new Intl.DateTimeFormat(ISO_DATE_LOCALE, options);',
    ];
    for (const line of allowed) {
      assert.deepEqual(runtimeDefaultLocalesIn(line), [], `should allow: ${line}`);
    }
  });

  test("no source file formats in the runtime's own locale", () => {
    const files = collectSourceFiles(SRC);

    // Positive control: a scan of an empty file list would pass vacuously.
    assert.ok(files.length > 50, `expected a real source tree, saw ${files.length}`);

    const violations = [];
    for (const file of files) {
      const rel = relative(SRC, file).split("\\").join("/");
      if (rel === LOCALE_OWNER) continue;
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const hit of runtimeDefaultLocalesIn(source)) {
        violations.push(`${rel}:${hit.line} — ${hit.snippet}`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `format through src/${LOCALE_OWNER} instead of the runtime locale:\n  ${violations.join("\n  ")}`
    );
  });

  test("the display locale is declared exactly once", () => {
    const declaring = collectSourceFiles(SRC).filter((file) =>
      /export const DISPLAY_LOCALE\b/.test(readFileSync(file, "utf8"))
    );
    assert.deepEqual(
      declaring.map((file) => relative(SRC, file).split("\\").join("/")),
      [LOCALE_OWNER]
    );
  });
});
