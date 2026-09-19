import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The design tokens are prose-documented in App.css and consumed by 30-odd
 * component stylesheets. Nothing enforced the link: a `var(--token)` whose
 * name no longer exists is not an error in CSS, it is a dropped declaration,
 * so a token rename or deletion fails silently and stays broken.
 *
 * That is not hypothetical. The Glacier glass pass deleted five dark-navy
 * surface tokens with the note "They have zero consumers" (App.css) — three
 * consumers survived it, in the radar controls and the hero stat block, and
 * went unnoticed for months because a dropped `background` looks like a
 * design choice. This test is what makes that claim checkable.
 *
 * A `var(--x, fallback)` is deliberate and always allowed: the author has
 * handled absence. Only a bare reference to an undefined name fails.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["src", "public"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
// A declaration: `--name:` at the start of a declaration, not inside var().
const DEFINITION = /(^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g;
// An inline style object in JSX: { "--name": value } / { '--name': value }.
const JSX_DEFINITION = /["'](--[a-zA-Z0-9_-]+)["']\s*:/g;
// A reference. Capture group 2 is non-empty when a fallback was supplied.
const REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,)?/g;

function collectFiles(dir, extensions, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectFiles(fullPath, extensions, found);
      continue;
    }
    if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(fullPath);
    }
  }

  return found;
}

function matchAll(source, pattern, groupIndex) {
  const names = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    names.push(match[groupIndex]);
    match = pattern.exec(source);
  }
  return names;
}

const cssFiles = SCAN_DIRS.flatMap((dir) =>
  collectFiles(join(REPO_ROOT, dir), [".css"])
);
const scriptFiles = SCAN_DIRS.flatMap((dir) =>
  collectFiles(join(REPO_ROOT, dir), [".js", ".jsx"])
).filter((file) => !file.includes(".test."));

const defined = new Set();
// Every bare reference, as `name` -> [locations], so a failure names the site.
const bareReferences = new Map();

function recordReferences(source, label) {
  REFERENCE.lastIndex = 0;
  let match = REFERENCE.exec(source);
  while (match !== null) {
    const [, name, fallback] = match;
    if (!fallback) {
      const sites = bareReferences.get(name) ?? [];
      if (!sites.includes(label)) sites.push(label);
      bareReferences.set(name, sites);
    }
    match = REFERENCE.exec(source);
  }
}

for (const file of cssFiles) {
  const source = readFileSync(file, "utf8").replace(CSS_COMMENT, "");
  for (const name of matchAll(source, DEFINITION, 2)) defined.add(name);
  recordReferences(source, relative(REPO_ROOT, file));
}

for (const file of scriptFiles) {
  const source = readFileSync(file, "utf8");
  // Custom properties set from an inline style object are real definitions:
  // WeatherDashboard's --i / --group-i stagger indices, AtmosphereParticles'
  // --size-boost. They exist only at runtime, so no CSS file declares them.
  for (const name of matchAll(source, JSX_DEFINITION, 1)) defined.add(name);
  recordReferences(source, relative(REPO_ROOT, file));
}

describe("CSS custom property contract", () => {
  test("the scan actually found the stylesheets it is meant to guard", () => {
    assert.ok(
      cssFiles.length > 20,
      `expected the component stylesheets, found ${cssFiles.length}`
    );
    assert.ok(
      defined.has("--accent") && defined.has("--bg-tile"),
      "expected the App.css token block to be in the scanned set"
    );
  });

  test("no stylesheet swallows a comment inside another comment", () => {
    /*
     * Sibling failure mode, same silence: 50cf3cb deleted a forced-colors
     * rule but left the last line of its comment behind. The opener then
     * ran on to the NEXT comment's close, eating the comment between them.
     *
     * Note what that means for detection: nothing is left dangling at the
     * end of the file, so "does an unmatched opener remain after stripping
     * comments" finds nothing. The signature is the swallowed opener —
     * CSS comments do not nest, so an opener inside a comment body is
     * always something that was meant to be code or documentation. An
     * uneven open/close count catches the case where no later close
     * exists to absorb it.
     */
    const damaged = [];
    for (const file of cssFiles) {
      const source = readFileSync(file, "utf8");
      const label = relative(REPO_ROOT, file);
      const opens = source.split("/*").length - 1;
      const closes = source.split("*/").length - 1;
      if (opens !== closes) {
        damaged.push(`${label} (${opens} openers, ${closes} closers)`);
        continue;
      }
      const swallowed = [...source.matchAll(CSS_COMMENT)].filter((match) =>
        match[0].slice(2).includes("/*")
      );
      if (swallowed.length > 0) {
        damaged.push(`${label} (${swallowed.length} comment(s) swallowed)`);
      }
    }

    assert.deepEqual(
      damaged,
      [],
      `an unclosed comment is eating everything up to the next close:\n  ` +
        damaged.join("\n  ")
    );
  });

  test("every bare var() reference names a token that exists", () => {
    const undefinedNames = [...bareReferences.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, sites]) => `${name} (${sites.join(", ")})`)
      .sort();

    assert.deepEqual(
      undefinedNames,
      [],
      `var() references with no definition anywhere — the declaration is ` +
        `silently dropped. Point it at a surviving token, define it, or ` +
        `give it an explicit fallback:\n  ${undefinedNames.join("\n  ")}`
    );
  });
});

/*
 * The semantic layer is only worth having while everything still goes
 * through it. The failure it guards against is quiet and easy: someone
 * inlines a colour back into --bg-large-card because a literal is easier
 * to read at the call site, the app looks exactly the same, and the next
 * palette change silently applies to everything except that one surface.
 *
 * So this pins the direction of the arrow — role first, named token
 * second — rather than any particular colour. Changing a value is a
 * one-line edit here and the test does not care. Changing where the
 * value lives is what it stops.
 */
const APP_CSS = readFileSync(join(REPO_ROOT, "src/App.css"), "utf8").replace(
  CSS_COMMENT,
  ""
);

// Reads the declared (unexpanded) value of a :root token.
function declaredValue(name) {
  const match = APP_CSS.match(
    new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`)
  );
  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

const SEMANTIC_ROLES = [
  "--ground-top",
  "--ground",
  "--ground-bottom",
  "--panel",
  "--panel-raised",
  "--panel-well",
  "--wire-structural",
  "--wire-rhythm",
  "--ink",
  "--ink-muted",
  "--ink-dim",
  "--status-accent",
  "--status-ok",
  "--status-warn",
  "--status-crit",
];

// legacy name -> the role it must defer to.
const DERIVED_FROM = {
  "--text": "--ink",
  "--text-muted": "--ink-muted",
  "--text-dim": "--ink-dim",
  "--bg-large-card": "--panel",
  "--bg-tile": "--panel-raised",
  "--bg-well": "--panel-well",
  "--card-border": "--wire-structural",
  "--border-soft": "--wire-rhythm",
  "--accent": "--status-accent",
  "--glacier": "--status-accent",
  "--accent-green": "--status-ok",
  "--green-good": "--status-ok",
  "--accent-warm": "--status-warn",
  "--amber": "--status-warn",
  "--accent-rose": "--status-crit",
};

describe("the semantic token layer", () => {
  test("every role is declared", () => {
    const missing = SEMANTIC_ROLES.filter((name) => declaredValue(name) === null);
    assert.deepEqual(missing, [], `roles with no declaration in App.css`);
  });

  test("each role holds a value rather than deferring to a legacy token", () => {
    /*
     * The arrow points one way. A role defined as `var(--accent)` would
     * read as layered but leave the colour where it was, so the theme
     * switch would still have to find and edit the old name.
     */
    const deferring = SEMANTIC_ROLES.filter((name) =>
      /var\(/.test(declaredValue(name) ?? "")
    );
    assert.deepEqual(
      deferring,
      [],
      `a role must own its colour, not point back at the token it replaced`
    );
  });

  test("the tokens components use resolve through a role", () => {
    const inlined = Object.entries(DERIVED_FROM)
      .filter(([token, role]) => !(declaredValue(token) ?? "").includes(`var(${role})`))
      .map(([token, role]) => `${token} should read var(${role}), reads ${declaredValue(token)}`);

    assert.deepEqual(
      inlined,
      [],
      `a colour was inlined back over the layer — it will be missed by the ` +
        `next palette change:\n  ${inlined.join("\n  ")}`
    );
  });

  test("the page background is drawn from the ground ramp", () => {
    // The only consumer of the layer outside the token block, and the one
    // surface a theme change is most visible on.
    const body = APP_CSS.match(/\nbody\s*\{([\s\S]*?)\n\}/);
    assert.ok(body, "expected a body rule in App.css");
    for (const role of ["--ground-top", "--ground", "--ground-bottom"]) {
      assert.ok(
        body[1].includes(`var(${role})`),
        `body's background no longer reads var(${role})`
      );
    }
  });
});

describe("opaque surfaces — Instrument step 2", () => {
  /*
   * Step 2 replaced the frosted glass with flat panels. Two things must
   * not quietly come back. A translucent panel role: the AA floor above
   * the ink alphas was recomputed against a FIXED backdrop, and an alpha
   * here would make that floor sky-dependent again without any test
   * noticing. And a backdrop-filter anywhere: the blur token is gone, so a
   * new one would be a fresh literal nobody budgeted for.
   */
  const OPAQUE = /^#[0-9a-f]{6}$|^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i;
  const PANEL_ROLES = ["--panel", "--panel-raised", "--panel-well"];

  test("every panel role is an opaque colour", () => {
    const translucent = PANEL_ROLES.map((name) => [name, declaredValue(name)]).filter(
      ([, value]) => !OPAQUE.test(value ?? "")
    );
    assert.deepEqual(
      translucent,
      [],
      `a panel role carries an alpha channel — the ink floor was computed against an opaque surface`
    );
  });

  test("no stylesheet applies a backdrop-filter", () => {
    const offenders = cssFiles
      .filter((file) => /backdrop-filter\s*:/.test(readFileSync(file, "utf8").replace(CSS_COMMENT, "")))
      .map((file) => relative(REPO_ROOT, file));
    assert.deepEqual(offenders, [], `backdrop-filter is back`);
  });

  test("the blur token is not declared anywhere", () => {
    assert.ok(
      !defined.has("--card-backdrop-blur"),
      `--card-backdrop-blur was re-declared; step 2 removed it with the blur it fed`
    );
  });
});
