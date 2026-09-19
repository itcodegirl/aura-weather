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

describe("the Instrument palette — step 3", () => {
  /*
   * The palette's accessibility claims are numbers computed from the
   * hexes in the block, so the block can prove them itself. Text must
   * clear WCAG AA (4.5:1) on every surface it sits on; the structural
   * wire must clear 1.4.11's 3:1 against both sides of the boundary it
   * draws; status colours must clear AA on the panel they are read on.
   * A palette edit that breaks any of these fails here, not in review.
   */
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const channel = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const value = (name) => {
    const v = declaredValue(name);
    assert.match(v ?? "", /^#[0-9a-f]{6}$/i, `${name} must be a six-digit hex to be measured`);
    return v;
  };

  const failing = (pairs, floor) =>
    pairs
      .map(([fg, bg]) => [fg, bg, contrast(value(fg), value(bg))])
      .filter(([, , ratio]) => ratio < floor)
      .map(([fg, bg, ratio]) => `${fg} on ${bg}: ${ratio.toFixed(2)} < ${floor}`);

  test("every ink emphasis clears AA on every surface", () => {
    const pairs = [];
    for (const ink of ["--ink", "--ink-muted", "--ink-dim"])
      for (const surface of ["--panel", "--panel-raised", "--panel-well"]) pairs.push([ink, surface]);
    assert.deepEqual(failing(pairs, 4.5), []);
  });

  test("the structural wire clears 3:1 on both sides of the boundary", () => {
    assert.deepEqual(
      failing([["--wire-structural", "--panel"], ["--wire-structural", "--ground"]], 3),
      []
    );
  });

  test("every status colour clears AA on the panel", () => {
    const pairs = ["--status-ok", "--status-warn", "--status-crit", "--status-accent"].map(
      (s) => [s, "--panel"]
    );
    assert.deepEqual(failing(pairs, 4.5), []);
  });
});

describe("the Instrument palette — light scheme (step 4) and both-theme guards (step 5)", () => {
  /*
   * The light block is a second :root under prefers-color-scheme: light.
   * The same claims hold there, measured against the light panel, plus
   * the two this step added: the structural wire clears 3:1 against the
   * ground as well as the panel (the brief's #8a909e measured 2.90 vs
   * its own ground), and every severity rung's text clears AA on that
   * rung's own background — badges are read on their tint, not on the
   * panel.
   */
  const LIGHT_BLOCK = APP_CSS.match(
    /@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/
  );
  const lightValue = (name) => {
    const m = (LIGHT_BLOCK?.[1] ?? "").match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`));
    return m ? m[1].trim().replace(/\s+/g, " ") : null;
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const channel = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const themes = { dark: declaredValue, light: lightValue };
  const hexOf = (read, name) => {
    const v = read(name);
    assert.match(v ?? "", /^#[0-9a-f]{6}$/i, `${name} must be a six-digit hex to be measured`);
    return v;
  };
  const failing = (read, pairs, floor) =>
    pairs
      .map(([fg, bg]) => [fg, bg, contrast(hexOf(read, fg), hexOf(read, bg))])
      .filter(([, , r]) => r < floor)
      .map(([fg, bg, r]) => `${fg} on ${bg}: ${r.toFixed(2)} < ${floor}`);

  test("the light block exists and declares every role", () => {
    assert.ok(LIGHT_BLOCK, "no @media (prefers-color-scheme: light) { :root { … } } block in App.css");
    const missing = SEMANTIC_ROLES.filter((name) => lightValue(name) === null);
    assert.deepEqual(missing, [], "roles with no light declaration");
  });

  for (const [theme, read] of Object.entries(themes)) {
    test(`${theme}: every ink emphasis clears AA on every surface`, () => {
      const pairs = [];
      for (const ink of ["--ink", "--ink-muted", "--ink-dim"])
        for (const surface of ["--panel", "--panel-raised", "--panel-well"]) pairs.push([ink, surface]);
      assert.deepEqual(failing(read, pairs, 4.5), []);
    });

    test(`${theme}: the structural wire clears 3:1 against the panel AND the ground`, () => {
      assert.deepEqual(
        failing(read, [["--wire-structural", "--panel"], ["--wire-structural", "--ground"]], 3),
        []
      );
    });

    test(`${theme}: every status colour clears AA on the panel`, () => {
      const pairs = ["--status-ok", "--status-warn", "--status-crit", "--status-accent"].map((s) => [s, "--panel"]);
      assert.deepEqual(failing(read, pairs, 4.5), []);
    });
  }

  test("light: every severity rung's text clears AA on its own background", () => {
    // Dark rungs use translucent backgrounds and are measured in the
    // rendered suite; the light rungs are opaque hexes and can be
    // measured here.
    const pairs = ["critical", "high", "warn", "ok", "info"].map((r) => [
      `--severity-${r}-fg`,
      `--severity-${r}-bg`,
    ]);
    assert.deepEqual(failing(lightValue, pairs, 4.5), []);
  });
});

/*
 * Instrument step 3b-i — flat, square chrome and the measuring face.
 *
 * Three of these guard values; the fourth guards a shape of CSS that is
 * valid to write and silently fatal to ship.
 *
 * `box-shadow` takes a comma-separated list, and `none` is not a legal
 * member of one: `box-shadow: 0 0 0 3px rgba(...), none;` is discarded
 * whole, taking the focus ring with it. Flattening the shadow recipe to
 * `none` turned every rule that composed `var(--shadow-raise-sm)` into
 * a larger list into exactly that. Two rules did — one of them the
 * header's focus ring. The values below are easy to re-check by eye;
 * that composition is not, which is why it gets a test.
 */
describe("flat, square chrome — Instrument step 3b-i", () => {
  const RAMP = [
    "--radius",
    "--card-radius",
    "--radius-control",
    "--radius-md",
    "--radius-sm",
    "--radius-xs",
  ];

  for (const token of RAMP) {
    test(`${token} is square`, () => {
      assert.equal(declaredValue(token), "0");
    });
  }

  test("--radius-pill still draws circles", () => {
    // Not part of the ramp: dots, handles and avatar wells are round
    // because they are not rectangles, and squaring them would be a
    // different claim than "Instrument squares its panels".
    assert.equal(declaredValue("--radius-pill"), "999px");
  });

  const SHADOWS = [
    "--shadow",
    "--card-shadow",
    "--card-shadow-hover",
    "--shadow-bevel",
    "--shadow-bevel-strong",
    "--shadow-raise-sm",
    "--shadow-raise",
    "--shadow-raise-lg",
    "--subcard-shadow",
  ];

  for (const token of SHADOWS) {
    test(`${token} draws nothing`, () => {
      assert.equal(declaredValue(token), "none");
    });
  }

  test("no rule composes a shadow token into a multi-layer box-shadow", () => {
    const offenders = [];
    for (const file of cssFiles) {
      const source = readFileSync(file, "utf8").replace(CSS_COMMENT, "");
      const declarations = source.matchAll(/box-shadow:\s*([^;]+);/g);
      for (const [, value] of declarations) {
        const flat = value.replace(/\s+/g, " ").trim();
        // Split on commas that are not inside rgba(...) / var(...).
        const layers = flat.split(/,(?![^()]*\))/).map((l) => l.trim());
        if (layers.length < 2) continue;
        const composed = layers.filter((layer) =>
          /^var\(--(?:shadow|card-shadow|subcard-shadow)/.test(layer)
        );
        if (composed.length > 0) {
          offenders.push(`${relative(REPO_ROOT, file)}: ${flat}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  test("--font-mono asks for the subset face first", () => {
    const stack = declaredValue("--font-mono");
    assert.ok(stack, "--font-mono is not declared");
    assert.match(stack, /^"IBM Plex Mono"/);
    // A generic monospace last, so a failed font load still lands on a
    // fixed-advance face and the readouts keep their column.
    assert.match(stack, /monospace$/);
  });

  test("every weight the mono stack is used at is declared and shipped", () => {
    const html = readFileSync(join(REPO_ROOT, "index.html"), "utf8");
    const serviceWorker = readFileSync(join(REPO_ROOT, "public/sw.js"), "utf8");
    for (const [weight, file] of [
      [400, "IBMPlexMono-Regular.woff2"],
      [500, "IBMPlexMono-Medium.woff2"],
      [600, "IBMPlexMono-SemiBold.woff2"],
    ]) {
      assert.match(
        html,
        new RegExp(
          `font-weight: ${weight};[^}]*${file.replace(".", "\\.")}`,
          "s"
        ),
        `index.html does not declare IBM Plex Mono ${weight}`
      );
      statSync(join(REPO_ROOT, "public/fonts", file));
      assert.ok(
        serviceWorker.includes(`/fonts/${file}`),
        `${file} is missing from the offline shell, so the readouts lose their face offline`
      );
    }
  });
});

/*
 * "No sky in light" — the flat ground, and the two overrides that only
 * work where they sit.
 *
 * A media query adds no specificity. A light-scheme rule that restates
 * a property the base rule also declares therefore wins only by source
 * order, and both of these corrections were written inside the light
 * token block at the top of App.css first, where they silently did
 * nothing: the page kept rendering rgb(211,218,226) for a `#e4e9ef`
 * ground and the computed styles all read correct, because the dimming
 * was a `filter` on a pseudo-element one layer down.
 *
 * The light block *can* still turn `.app::after` off from up there, and
 * that is not an inconsistency: the base rule never declares `display`,
 * so nothing competes. These two do compete, so they are tested for
 * position, not just presence.
 */
describe("the light ground stays flat", () => {
  // Comments stripped, so an example in prose cannot satisfy a check.
  const SOURCE = readFileSync(join(REPO_ROOT, "src/App.css"), "utf8").replace(
    CSS_COMMENT,
    ""
  );

  function indexOfRule(pattern, label) {
    const match = SOURCE.match(pattern);
    assert.ok(match, `${label} is not in App.css`);
    return match.index;
  }

  const LIGHT_BLOCK = /@media \(prefers-color-scheme: light\) \{/;

  test("body drops the scene washes, after the rule that paints them", () => {
    const base = indexOfRule(
      /\nbody \{[^}]*radial-gradient[^}]*\}/,
      "the base body background"
    );
    const override = indexOfRule(
      /@media \(prefers-color-scheme: light\) \{\s*body \{\s*background: var\(--ground\);/,
      "the light body background"
    );
    assert.ok(
      override > base,
      "the light body rule precedes the one it corrects, so source order discards it"
    );
  });

  test(".app::before drops its filter, after the rule that sets one", () => {
    const base = indexOfRule(
      /\n\.app::before \{[^}]*filter:[^}]*\}/,
      "the base .app::before filter"
    );
    const override = indexOfRule(
      /@media \(prefers-color-scheme: light\) \{\s*\.app::before \{\s*filter: none;/,
      "the light .app::before filter reset"
    );
    assert.ok(
      override > base,
      "the light filter reset precedes the filter it clears, so it is discarded"
    );
  });

  test("the light scheme is declared at all", () => {
    assert.match(SOURCE, LIGHT_BLOCK);
  });
});
