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

/*
 * Instrument 3b-ii — the module header row.
 *
 * A card's name is a 10px mono rule, and a status is a coloured word
 * rather than a filled capsule. The rung modifiers on .severity-badge
 * are deliberately left in the file with their border-color and
 * background stripped, so re-filling a rung stays a one-line change;
 * what must not come back silently is the capsule on the base rule,
 * because that is what would make the header say its rank twice.
 */
describe("module headers — Instrument step 3b-ii", () => {
  const BASE = APP_CSS.slice(0, APP_CSS.indexOf("@media"));

  function rule(name) {
    const match = APP_CSS.match(
      new RegExp(`\\n\\${name} \\{([^}]*)\\}`)
    );
    assert.ok(match, `${name} is not in App.css`);
    return match[1];
  }

  test("a card's name is drawn at the caption step, not as a heading", () => {
    // Consumed only by the eight *-title rules, so this token is the
    // whole statement of the header size.
    assert.equal(declaredValue("--section-title-size"), "var(--fs-caption)");
    assert.equal(
      declaredValue("--section-title-lg-size"),
      "var(--section-title-size)"
    );
  });

  test("every card title takes the mono header treatment", () => {
    const missing = [];
    for (const file of cssFiles) {
      const source = readFileSync(file, "utf8").replace(CSS_COMMENT, "");
      for (const [, selector, body] of source.matchAll(
        /\n(\.[a-z]+-title) \{([^}]*)\}/g
      )) {
        if (!/font-size:\s*var\(--section-title(?:-lg)?-size/.test(body)) continue;
        const has =
          /font-family:\s*var\(--font-mono\)/.test(body) &&
          /text-transform:\s*uppercase/.test(body) &&
          /letter-spacing:\s*var\(--track-header\)/.test(body);
        if (!has) missing.push(`${relative(REPO_ROOT, file)}: ${selector}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test("a status is a word, not a filled capsule", () => {
    const body = rule(".severity-badge");
    assert.match(body, /font-family:\s*var\(--font-mono\)/);
    assert.match(body, /text-transform:\s*uppercase/);
    assert.doesNotMatch(
      body,
      /border-radius:\s*var\(--radius-pill\)/,
      "the status word grew a capsule back"
    );
    assert.match(body, /border:\s*0/);
    assert.match(body, /background:\s*none/);
  });

  test("the scope chip is a square hairline, on the rhythm wire", () => {
    const body = rule(".eyebrow-pill");
    assert.doesNotMatch(body, /border-radius:\s*var\(--radius-pill\)/);
    assert.match(body, /border:\s*1px solid var\(--wire-rhythm\)/);
    assert.match(body, /background:\s*none/);
  });

  test("--track-header exists and is wider than the loose step", () => {
    const header = Number.parseFloat(declaredValue("--track-header"));
    const loose = Number.parseFloat(declaredValue("--track-loose"));
    assert.ok(
      header > loose,
      `--track-header ${header}em should exceed --track-loose ${loose}em`
    );
    assert.ok(BASE.includes("--track-header"), "--track-header is not in :root");
  });
});

/*
 * --active-pill-bg and --active-pill-color are a pair: each scheme declares
 * both so the pressed state inverts as a unit. Taking only the colour and
 * painting the background from some other token breaks that, and it broke
 * silently -- CSS has no way to say "these two go together".
 *
 * It shipped that way. `.unit-btn.is-active` kept `color:
 * var(--active-pill-color)` while painting `linear-gradient(145deg,
 * var(--paper), var(--severity-info-fg))`. All three tokens invert with the
 * scheme, so in dark the text went light at the same time the background
 * did: 1.26 against --paper and 1.07 against --severity-info-fg, on the
 * always-visible °F/°C and climate-context toggles. The two StatusStack
 * primaries did the same on :hover with a literal #ffffff -- 1.31 dark,
 * 1.07 light.
 *
 * So: any rule that sets --active-pill-color must take --active-pill-bg for
 * its background, and must not repaint that background in a :hover.
 */
describe("the active-pill pair stays a pair", () => {
  const FILES = [
    "src/components/layout/AppHeader.css",
    "src/components/layout/StatusStack.css",
  ];

  // A rule is `selectors { body }`; the body has no nested braces in these
  // files outside at-rules, which this split leaves intact inside the body.
  function rules(source) {
    const found = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      found.push({ selector: m[1].trim(), body: m[2] });
    }
    return found;
  }

  test("a rule that takes the pill colour takes the pill background", () => {
    const offenders = [];
    for (const relPath of FILES) {
      const source = readFileSync(join(REPO_ROOT, relPath), "utf8").replace(
        CSS_COMMENT,
        ""
      );
      for (const { selector, body } of rules(source)) {
        if (!/color:\s*var\(--active-pill-color\)/.test(body)) continue;
        const background = body.match(/\bbackground(?:-color)?:\s*([^;]+)/);
        if (!background) continue;
        if (!/var\(--active-pill-bg\)/.test(background[1])) {
          offenders.push(`${relPath}: ${selector} -> ${background[1].trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these paint a background the pressed colour was not measured against:\n${offenders.join("\n")}`
    );
  });

  test("no hover repaints an active-pill background", () => {
    const offenders = [];
    for (const relPath of FILES) {
      const source = readFileSync(join(REPO_ROOT, relPath), "utf8").replace(
        CSS_COMMENT,
        ""
      );
      for (const { selector, body } of rules(source)) {
        if (!/--primary:hover|\.is-active:hover/.test(selector)) continue;
        const background = body.match(/\bbackground(?:-color)?:\s*([^;]+)/);
        if (background) {
          offenders.push(`${relPath}: ${selector} -> ${background[1].trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `a primary's hover repaints its background while the label stays --active-pill-color:\n${offenders.join("\n")}`
    );
  });

  test("the near-white gradient is gone from both files", () => {
    for (const relPath of FILES) {
      const source = readFileSync(join(REPO_ROOT, relPath), "utf8").replace(
        CSS_COMMENT,
        ""
      );
      assert.doesNotMatch(
        source,
        /linear-gradient\(145deg,\s*(#ffffff|var\(--paper\))/i,
        `${relPath} still paints a control with the near-white gradient`
      );
    }
  });
});

/*
 * Component-level colour literals.
 *
 * The token guards above cover App.css. Nothing covered the components, and
 * the gap had already cost something: commit 2558b5b moved `.hourly-bar` off
 * the --chart-* gradients for exactly this reason and left `.hourly-wspd`
 * thirty lines below the comment explaining why, still on them, at 2.52:1
 * against the track it has to be read against. Four more scheme-blind
 * literals were found the same way -- a gust reading at 1.13:1 in light, a
 * compass cardinal at 1.10:1, the wind needle and visibility meter at
 * 2.16:1, and the sun bead at 1.78:1 -- every one of them a dark-scheme
 * value frozen into JSX where prefers-color-scheme cannot reach it.
 *
 * So this is a ledger, not a pattern match. Every literal that survives is
 * listed with the reason it is allowed, and both adding one and removing one
 * fail the test: an addition has to be justified here, and a removal has to
 * be struck off. A guard that silently accepts new entries would not have
 * caught the case that motivated it.
 */
describe("component colour literals are a closed set", () => {
  // A literal is allowed only where it cannot carry information: a gradient
  // stop that fades to nothing, or a track/halo whose reading is printed as
  // adjacent text. Ratios are measured against the surface each one sits on.
  const ALLOWED = [
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(111,183,242,.08)",
      count: 1,
      why: "compass dial ground, 1.06:1 light -- a tint behind the needle, not a mark",
    },
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(255,255,255,.2)",
      count: 1,
      why: "compass ring; track family, 1.00:1 light -- open design decision",
    },
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(255,255,255,.16)",
      count: 2,
      why: "arc gauge + sun horizon track; track family, 1.00:1 light -- open design decision",
    },
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(255,255,255,.1)",
      count: 1,
      why: "arc gauge track, MISSING state (dashed); 1.02:1 light -- same open decision. The narrower detector this guard used to run never saw this one at all.",
    },
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(243,183,101,.5)",
      count: 1,
      why: "sun path arc; the track the bead travels, 1.33:1 light -- open design decision",
    },
    {
      file: "src/components/AtmosphereBento.jsx",
      value: "rgba(243,183,101,.35)",
      count: 1,
      why: "sun bead halo, 1.22:1 light -- ornament around a bead that clears at 6.33:1",
    },
    {
      file: "src/components/HourlyCard.jsx",
      value: "#f3b765",
      count: 2,
      why: "temp area gradient stops at 0.18 and 0 opacity -- decorative fill, 1.4.11 exempt",
    },
    // Leaflet vector options. These paint over a map basemap, which is not
    // one of the app's themed surfaces and does not answer
    // prefers-color-scheme, so a fixed value is the correct choice rather
    // than a drifted one -- RadarMap's own comment says "amber against a
    // light basemap".
    { file: "src/components/radar/RadarMap.jsx", value: "#6fb7f2", count: 3, why: "location halo/dot over the map basemap" },
    { file: "src/components/radar/RadarMap.jsx", value: "#f8fafc", count: 1, why: "location dot ring over the map basemap" },
    { file: "src/components/radar/RadarMap.jsx", value: "#f2a33c", count: 2, why: "alert boundary over the map basemap" },
  ];

  // Any colour literal at all, anywhere in a .jsx file, after comments are
  // stripped. Two narrower detectors were tried and both were false
  // promises against this block's own claim of a closed set: matching only
  // the JSX attribute form (fill="#abc") walked past object literals, and
  // adding colour-named properties (color: "#abc") still walked past
  // WeatherIcon's palette, which is keyed by weather code -- `0: "#fbbf24"`.
  // A literal cannot answer prefers-color-scheme whatever syntax holds it,
  // so the detector keys on the value, not on its surroundings.
  const ATTR = /(#[0-9a-fA-F]{3,8}\b|rgba?\([0-9.,\s/%]+\))/g;

  const jsxFiles = collectFiles(join(REPO_ROOT, "src"), [".jsx"]);

  function foundLiterals() {
    const out = [];
    for (const file of jsxFiles) {
      const relPath = relative(REPO_ROOT, file).split("\\").join("/");
      // Strip block and line comments first: several of these files quote
      // old literals in prose explaining why they were removed, and a guard
      // that trips on its own changelog is noise.
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      for (const match of source.matchAll(ATTR)) {
        out.push({ file: relPath, value: match[1].trim() });
      }
    }
    return out;
  }

  test("every surviving literal is one that cannot carry information", () => {
    const key = (x) => `${x.file} :: ${x.value}`;

    // Counted, not just listed. Keying on file+value alone let an
    // already-allowed hex be reused on a NEW element and pass in silence,
    // quietly extending a reason measured for one specific mark ("sun bead
    // halo") to whatever else happened to pick the same value.
    const tally = (rows, weight) =>
      rows.reduce((acc, row) => {
        acc[key(row)] = (acc[key(row)] ?? 0) + weight(row);
        return acc;
      }, {});

    const found = tally(foundLiterals(), () => 1);
    const allowed = tally(ALLOWED, (row) => row.count ?? 1);

    const drift = [];
    for (const k of new Set([...Object.keys(found), ...Object.keys(allowed)])) {
      const have = found[k] ?? 0;
      const want = allowed[k] ?? 0;
      if (have !== want) drift.push(`${k} — found ${have}, allowed ${want}`);
    }

    assert.deepEqual(
      drift.sort(),
      [],
      "a colour literal in a .jsx file cannot answer prefers-color-scheme, " +
        "so it renders one scheme's value in both. Route it through a token, " +
        "or record it in ALLOWED with the measured reason it carries no " +
        "information and the number of places it appears. A count that no " +
        "longer matches means a literal was added, removed or reused"
    );
  });

  test("marks that carry a reading stay on their tokens", () => {
    const hourlyCss = readFileSync(
      join(REPO_ROOT, "src/components/HourlyCard.css"),
      "utf8"
    );
    const atmCss = readFileSync(
      join(REPO_ROOT, "src/components/AtmosphereBento.css"),
      "utf8"
    );

    // EVERY block for the selector, not the first. A light-scheme or
    // high-contrast override is exactly how a third value slips in behind a
    // guard that only reads the base rule, and this test's whole claim is
    // that naming the token stops that.
    const rules = (css, selector) => {
      const pattern = new RegExp(
        `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
        "g"
      );
      const bodies = [...css.matchAll(pattern)].map((m) => m[1]);
      assert.ok(bodies.length > 0, `${selector} should still have a rule`);
      return bodies;
    };
    const assertEvery = (css, selector, expected) => {
      for (const body of rules(css, selector)) {
        assert.match(
          body,
          expected,
          `${selector} has a block that does not use the expected token`
        );
      }
    };

    // The sustained-wind fill and the legend key that stands for it. These
    // are the two that were left behind; the assertion names the token
    // rather than merely forbidding the old one, so a third value cannot
    // slip in either.
    assertEvery(hourlyCss, ".hourly-wspd", /background:\s*var\(--status-accent\)/);
    assertEvery(hourlyCss, ".lg-bar.b-mid", /background:\s*var\(--status-accent\)/);
    assertEvery(hourlyCss, ".hourly-temp-line", /stroke:\s*var\(--accent-warm\)/);
    assertEvery(atmCss, ".atm-gust-value", /color:\s*var\(--text\)/);
    assertEvery(atmCss, ".atm-needle", /stroke:\s*var\(--status-accent\)/);
    assertEvery(atmCss, ".atm-needle-head", /fill:\s*var\(--status-accent\)/);
    assertEvery(atmCss, ".atm-compass-cardinal", /fill:\s*var\(--text-muted\)/);
    assertEvery(atmCss, ".atm-vis-bar--filled", /fill:\s*var\(--status-accent\)/);
    assertEvery(atmCss, ".atm-sun-bead", /fill:\s*var\(--accent-warm\)/);
    // The 50% rule and the legend swatch that stands for it. Both were
    // white-alpha, which measured 1.03:1 and 1.04:1 in light -- a
    // reference line and its key, invisible in the scheme.
    assertEvery(hourlyCss, ".hourly-thresh", /border-top:[^;]*var\(--wire-structural\)/);
    assertEvery(hourlyCss, ".lg-dash", /border-top:[^;]*var\(--wire-structural\)/);
  });

  // WeatherIcon's palette is keyed by weather code inside a JSX object,
  // which is why the literal ledger above had to key on the value rather
  // than the syntax. Now that it is tokenised the ledger carries no
  // WeatherIcon row at all, so these are the guards that the values did
  // not simply move somewhere else unthemed, and that each scheme's
  // values clear WCAG 1.4.11's 3:1 floor for graphical objects.
  const iconSource = readFileSync(
    join(REPO_ROOT, "src/components/WeatherIcon.jsx"),
    "utf8"
  );
  const WX_TOKENS = [
    ...new Set(
      [...iconSource.matchAll(/var\((--wx-[a-z-]+)\)/g)].map((m) => m[1])
    ),
  ];
  const LIGHT_ROOT = APP_CSS.match(
    /@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/
  )?.[1] ?? "";
  const lightValue = (name) => {
    const m = LIGHT_ROOT.match(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`));
    return m ? m[1].trim().replace(/\s+/g, " ") : null;
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const channel = (c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const hexOf = (read, name) => {
    const v = read(name);
    assert.match(v ?? "", /^#[0-9a-f]{6}$/i, `${name} must be a six-digit hex to be measured`);
    return v;
  };

  test("every weather-condition colour is a token, defined once per scheme", () => {
    const codeCount = (
      iconSource
        .slice(
          iconSource.indexOf("const iconMap = {"),
          iconSource.indexOf("const iconColors = {")
        )
        .match(/^\s*\d+:/gm) ?? []
    ).length;
    const used = [...iconSource.matchAll(/var\((--wx-[a-z-]+)\)/g)];
    assert.equal(
      used.length,
      codeCount + 1,
      "one token per weather code, plus the unknown fallback"
    );

    // Exactly two declarations each: the dark value in the base :root and
    // the light override. A third would be a stray copy somewhere unthemed.
    for (const token of WX_TOKENS) {
      const declarations = [...APP_CSS.matchAll(
        new RegExp(`^\\s*${token}:`, "gm")
      )];
      assert.equal(
        declarations.length,
        2,
        `${token} should be declared exactly twice -- once in the base :root, once in the light-scheme override`
      );
      assert.notEqual(
        declaredValue(token),
        null,
        `${token} has no base (dark) declaration`
      );
      assert.notEqual(
        lightValue(token),
        null,
        `${token} has no light-scheme override`
      );
    }
  });

  test("light: every weather-condition fill is the same ink and clears 3:1 on the raised panel", () => {
    // Hue-coding is dropped in light. In-hue darkening to the 3:1 floor
    // collapsed snow, heavier snow and freezing rain into near-identical
    // blues, and every render of a variable-code icon (ForecastCard) sits
    // beside a distinct text label, so a single ink loses nothing. All 16
    // tokens must resolve to the same ink role, and that ink must clear
    // WCAG 1.4.11 against the card the icons are drawn on.
    const inks = new Set(WX_TOKENS.map((token) => lightValue(token)));
    assert.equal(
      inks.size,
      1,
      `light --wx-* tokens should share one value, found: ${[...inks].join(", ")}`
    );
    const [ink] = inks;
    const role = ink.match(/^var\((--ink(?:-muted|-dim)?)\)$/)?.[1];
    assert.ok(role, `light --wx-* value should be an ink role via var(), got ${ink}`);
    const ratio = contrast(hexOf(lightValue, role), hexOf(lightValue, "--panel-raised"));
    assert.ok(
      ratio >= 3,
      `${role} on --panel-raised in light: ${ratio.toFixed(2)} < 3`
    );
  });

  test("dark: every weather-condition fill clears 3:1 against the ground", () => {
    // --wx-tornado shipped at #6d28d9, which measured 2.79:1 against
    // --ground. The dark values are hexes, so the whole set is measured
    // here and a regression on any of them fails by name.
    const shortfalls = WX_TOKENS
      .map((token) => [token, contrast(hexOf(declaredValue, token), hexOf(declaredValue, "--ground"))])
      .filter(([, ratio]) => ratio < 3)
      .map(([token, ratio]) => `${token} on --ground: ${ratio.toFixed(2)} < 3`);
    assert.deepEqual(shortfalls, []);
  });

  test("the retired chart gradients stay retired", () => {
    // They outlived their last consumer, which is how the wind bars kept
    // reaching for them. All four measured 2.62-2.64:1 against --panel-well
    // in light, and the good- pair was green, which the rain-scale decision
    // bans outright.
    const retired = [
      "--chart-rain-top",
      "--chart-rain-bottom",
      "--chart-good-top",
      "--chart-good-bottom",
    ];
    const cssFiles = collectFiles(join(REPO_ROOT, "src"), [".css"]);
    const sources = [...cssFiles, ...jsxFiles].map((file) => ({
      relPath: relative(REPO_ROOT, file).split("\\").join("/"),
      text: readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    }));

    for (const token of retired) {
      for (const { relPath, text } of sources) {
        assert.ok(
          !text.includes(`var(${token})`),
          `${relPath} references ${token}, which was retired for failing ` +
            "WCAG 1.4.11 in the light scheme"
        );
        assert.ok(
          !new RegExp(`^\\s*${token}\\s*:`, "m").test(text),
          `${relPath} redefines ${token}; it was deleted so it could not be ` +
            "reached for again"
        );
      }
    }
  });
});

/*
 * The installed-PWA chrome has to agree with the app it opens.
 *
 * index.html declares theme-color per scheme (#070a10 dark / #e4e9ef light,
 * the two --ground values), but a web manifest carries a single colour for
 * both. The manifest kept the static #0b1c3f the page used before the light
 * scheme landed, and background_color kept an #081225 that has never been a
 * token at all -- so an installed app painted a navy splash and a navy
 * toolbar and then revealed the real ground underneath. Against the light
 * ground #0b1c3f measures 14.32:1: maximum discord rather than a near-miss.
 *
 * Nothing covered this, and the drift ran for two weeks between the icon
 * commit and the light-scheme commit. Anchored to index.html rather than to
 * a literal so the two cannot separate again.
 */
describe("the manifest agrees with the page it installs", () => {
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, "public/manifest.webmanifest"), "utf8")
  );
  const indexHtml = readFileSync(join(REPO_ROOT, "index.html"), "utf8");

  function themeColorFor(scheme) {
    const pattern = new RegExp(
      `<meta[^>]*name="theme-color"[^>]*prefers-color-scheme:\\s*${scheme}\\s*\\)"[^>]*content="([^"]+)"`
    );
    const match = pattern.exec(indexHtml);
    assert.ok(match !== null, `index.html should declare a ${scheme} theme-color`);
    return match[1].toLowerCase();
  }

  test("theme_color is the page's own dark theme-color", () => {
    assert.equal(
      manifest.theme_color.toLowerCase(),
      themeColorFor("dark"),
      "the installed toolbar colour must be one the app actually uses"
    );
  });

  test("background_color is a declared ground, not an invented navy", () => {
    const grounds = [themeColorFor("dark"), themeColorFor("light")];
    assert.ok(
      grounds.includes(manifest.background_color.toLowerCase()),
      `background_color ${manifest.background_color} is not one of the ` +
        `declared grounds (${grounds.join(", ")}); the splash would reveal a ` +
        "different colour than it painted"
    );
  });
});

/*
 * A high-contrast preference must not swap the colour scheme.
 *
 * Three blocks carried dark-scheme values under a bare
 * `@media (prefers-contrast: more)`: near-white inks in App.css, and
 * near-black backgrounds for the bento cards and the header. With no scheme
 * condition they matched in light mode too, and because they sit later in
 * their files than the light + high-contrast block at equal specificity,
 * they won. A light-mode user who asked the OS for MORE contrast therefore
 * got the dark palette's inks on light surfaces: the compass cardinal
 * measured 1.10:1 on a white tile, and the hourly temperature line 2.54:1
 * against a card that had turned near-black underneath it while the tiles
 * inside it stayed white.
 *
 * The people who set that preference are the ones the contrast work is for,
 * so they were the only ones getting the inverted palette. This guard keeps
 * a contrast preference from carrying a scheme with it.
 */
describe("a contrast preference does not imply a colour scheme", () => {
  const cssFiles = collectFiles(join(REPO_ROOT, "src"), [".css"]);

  // A colour-valued declaration: a background/colour/fill/stroke/border, or
  // a custom property whose value is a colour. A filter or an opacity is
  // scheme-neutral and is deliberately not caught.
  const COLOUR_DECL =
    /(?:^|[;{\s])(?:background(?:-color)?|color|fill|stroke|border(?:-color)?|--[\w-]+)\s*:\s*[^;]*(#[0-9a-fA-F]{3,8}\b|rgba?\([0-9.,\s/%]+\))/;

  test("no bare prefers-contrast block carries a scheme-specific colour", () => {
    const offenders = [];

    for (const file of cssFiles) {
      const relPath = relative(REPO_ROOT, file).split("\\").join("/");
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

      const media = /@media([^{]*)\{/g;
      let match;
      while ((match = media.exec(source)) !== null) {
        const condition = match[1];
        if (!/prefers-contrast:\s*more/.test(condition)) continue;
        if (/prefers-color-scheme/.test(condition)) continue;

        // Walk to the matching brace so nested rules are included.
        let depth = 1;
        let i = media.lastIndex;
        while (i < source.length && depth > 0) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") depth -= 1;
          i += 1;
        }
        const body = source.slice(media.lastIndex, i - 1);
        const colour = COLOUR_DECL.exec(body);
        if (colour) {
          offenders.push(`${relPath}: @media${condition.trim()} sets ${colour[1]}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "a prefers-contrast block with no prefers-color-scheme condition " +
        "applies in BOTH schemes, so a colour in it is right in one and " +
        "inverted in the other. Add the scheme condition, and a counterpart " +
        "for the other scheme if that scheme also needs the treatment"
    );
  });
});
