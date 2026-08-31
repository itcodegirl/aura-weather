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
