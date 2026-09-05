import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The README advertises a strict dependency direction
 * (`components → hooks → api/services → utils/domain`), and
 * eslint-plugin-boundaries enforces it *between* those layers. Two things it
 * cannot see:
 *
 *   1. An inversion *inside* a layer. `hooks/locationHelpers.js` and
 *      `hooks/savedLocationsSyncHelpers.js` are pure modules that sat beside
 *      `useLocation.js` and imported constants from it. Same layer, so no
 *      rule fired -- but that hook imports React, so loading either "pure
 *      helper" loaded React with it (audit A-02/O-12).
 *   2. Reachability. A rule about direct imports says nothing about what a
 *      module drags in two hops down.
 *
 * So this walks the real static import graph. The claim it makes is the one
 * the README makes, and it was previously only ever checked by grep.
 *
 * Static `import`/`export ... from` only: a dynamic `import()` is a lazy
 * boundary, which is how the components layer legitimately defers panels.
 */

const SRC = fileURLToPath(new URL(".", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SOURCE_EXTENSIONS = [".js", ".jsx"];

// `from "..."` in an import or a re-export, quotes either way.
const FROM = /(?:^|\s)(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
// A bare side-effect import: `import "./index.css"`.
const BARE_IMPORT = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function collectFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, found);
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

function specifiersIn(source) {
  const found = [];
  for (const pattern of [FROM, BARE_IMPORT]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      found.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return found;
}

/** Resolves a relative specifier the way Vite does, extension optional. */
function resolveRelative(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile()
  );
}

const sourceFiles = collectFiles(SRC);
const importsOf = new Map();
for (const file of sourceFiles) {
  importsOf.set(file, specifiersIn(readFileSync(file, "utf8")));
}

/**
 * Every package name reachable from `entry` by following relative imports.
 * Returns a map of package -> the shortest import chain that reaches it, so
 * a failure names the path rather than just the verdict.
 */
function reachablePackages(entry) {
  const reached = new Map();
  const seen = new Set();
  const queue = [[entry, [relative(SRC, entry)]]];

  while (queue.length > 0) {
    const [file, chain] = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf.get(file) ?? []) {
      if (specifier.startsWith(".")) {
        const target = resolveRelative(file, specifier);
        if (target && !seen.has(target)) {
          queue.push([target, [...chain, relative(SRC, target)]]);
        }
        continue;
      }
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!reached.has(packageName)) {
        reached.set(packageName, [...chain, specifier]);
      }
    }
  }

  return reached;
}

const REACT_PACKAGES = new Set(["react", "react-dom"]);

function reactChain(entry) {
  for (const [packageName, chain] of reachablePackages(entry)) {
    if (REACT_PACKAGES.has(packageName)) return chain;
  }
  return null;
}

describe("module graph", () => {
  test("the walker actually resolved this repo's modules", () => {
    assert.ok(
      sourceFiles.length > 60,
      `expected the src tree, found ${sourceFiles.length} files`
    );
    // A control: a component must reach React, or the walk proves nothing.
    assert.ok(
      reactChain(join(SRC, "App.jsx")),
      "App.jsx should reach react — the walk is not following imports"
    );
  });

  test("the layers below hooks never reach React, however indirectly", () => {
    const offenders = [];
    for (const file of sourceFiles) {
      const path = relative(SRC, file);
      if (!/^(domain|utils|api|services)\//.test(path)) continue;
      const chain = reactChain(file);
      if (chain) offenders.push(`${path}\n      via ${chain.join(" → ")}`);
    }

    assert.deepEqual(
      offenders,
      [],
      `these modules are documented as React-free but reach it:\n    ` +
        offenders.join("\n    ")
    );
  });

  test("the pure helpers beside the hooks stay pure", () => {
    /*
     * These four hold no state and call no React API; three of them are
     * described as "pure helpers" in the README's tree. Importing a constant
     * upward from a hook is what previously made that false — cheap to do by
     * accident, invisible in review, and it puts React in the graph of a
     * module whose whole point is not needing it.
     */
    const pureHelpers = [
      "hooks/locationHelpers.js",
      "hooks/savedLocationsSyncHelpers.js",
      "hooks/climateComparison.js",
      "hooks/rainAlertHelpers.js",
    ];

    const offenders = [];
    for (const path of pureHelpers) {
      const file = join(SRC, path);
      assert.ok(existsSync(file), `${path} has moved — update this list`);
      const chain = reactChain(file);
      if (chain) offenders.push(`${path}\n      via ${chain.join(" → ")}`);
    }

    assert.deepEqual(
      offenders,
      [],
      `a pure helper is importing upward into a React module:\n    ` +
        offenders.join("\n    ")
    );
  });
});
