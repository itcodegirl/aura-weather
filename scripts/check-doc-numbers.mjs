#!/usr/bin/env node
/*
 * Fails when a number the README states about this repo has stopped being
 * true.
 *
 * The README's whole argument is that its claims are checkable, so a stale
 * count there is not a typo -- it is the thesis failing on its own front
 * page. It went stale three times in a week: before the docs truth-up, again
 * within a day of it, and again in the three days it took to write this --
 * eight figures moved while the guard was under review. Prose does not fail
 * a build; this does.
 *
 * Claims are marked in the README so they survive rewording:
 *
 *     `<!--n:unit-tests-->N<!--/n-->` tests across ...
 *
 * The comments do not render, so a reader just sees the number. Every marker
 * must resolve to a key below, and every key must appear at least once --
 * a renamed or dropped marker is itself a failure, so this cannot quietly
 * stop checking anything.
 *
 * Test counts come from the suites themselves. Running them here would mean
 * running them twice in CI, so `--unit <file>` and `--render <file>` accept
 * the TAP output an earlier step already captured; without those flags the
 * script runs the suites itself, which is what you want locally.
 *
 * `--write` rewrites the markers to the computed values, so adding tests
 * does not mean hand-editing the README.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const README = join(ROOT, "README.md");

const MARKER = /<!--n:([a-z0-9-]+)-->\s*([\d,]+)\s*<!--\/n-->/g;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function tapCount(text, field) {
  const match = new RegExp(`^# ${field} (\\d+)$`, "m").exec(text);
  if (!match) {
    throw new Error(`could not find "# ${field}" in the TAP output`);
  }
  return Number(match[1]);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return `${result.stdout}${result.stderr}`;
}

function readOrRun(file, command, args, label) {
  if (file) {
    if (!existsSync(file)) throw new Error(`${label} log not found: ${file}`);
    return readFileSync(file, "utf8");
  }
  return run(command, args);
}

const args = parseArgs(process.argv.slice(2));

const unitTap = readOrRun(args.unit, "node", ["--test"], "unit");
const renderTap = readOrRun(
  args.render,
  "node",
  ["scripts/run-render-tests.mjs"],
  "render"
);

// Playwright's --list needs no browser, so it is always cheap enough to run.
const e2eList = run("npx", ["playwright", "test", "--list"]);
const e2eLines = e2eList
  .split("\n")
  .filter((line) => /^\s+\[[^\]]+\]\s+›/.test(line));
if (e2eLines.length === 0) {
  throw new Error("playwright --list produced no test lines");
}
// These three specs exist to regenerate committed imagery; they assert
// little, so the README counts them separately rather than inflating the
// behavioural figure with them.
const CAPTURE_SPECS =
  /readme-screenshots|trust-contract-screenshot|social-pwa-assets/;

function fileTestCount(relativePath) {
  return tapCount(run("node", ["--test", relativePath]), "tests");
}

const actual = {
  "unit-tests": tapCount(unitTap, "tests"),
  "unit-suites": tapCount(unitTap, "suites"),
  "render-tests": tapCount(renderTap, "tests"),
  "e2e-behavioural": e2eLines.filter((l) => !CAPTURE_SPECS.test(l)).length,
  "e2e-capture": e2eLines.filter((l) => CAPTURE_SPECS.test(l)).length,
  "app-css-lines": readFileSync(join(ROOT, "src/App.css"), "utf8").split("\n")
    .length - 1,
  "numbers-tests": fileTestCount("src/utils/numbers.test.mjs"),
  "transforms-tests": fileTestCount("src/api/transforms.test.mjs"),
  "herocard-render-tests": fileTestCount(
    "src/components/HeroCard.render.test.mjs"
  ),
};

const readme = readFileSync(README, "utf8");

// `--write` rewrites every marker to the computed figure. The counts move
// whenever tests are added, so asking a contributor to hand-edit eight
// numbers is how a guard turns into a nuisance people route around.
if ("write" in args) {
  let written = 0;
  const updated = readme.replace(MARKER, (whole, key, value) => {
    if (!(key in actual)) return whole;
    if (Number(value.replace(/,/g, "")) === actual[key]) return whole;
    written += 1;
    return `<!--n:${key}-->${actual[key]}<!--/n-->`;
  });
  writeFileSync(README, updated);
  console.log(`README numbers updated: ${written} marker(s) rewritten`);
  process.exit(0);
}

const claims = [];
for (const match of readme.matchAll(MARKER)) {
  claims.push({ key: match[1], value: Number(match[2].replace(/,/g, "")) });
}

const failures = [];
const unknown = claims.filter((c) => !(c.key in actual));
for (const claim of unknown) {
  failures.push(`  ${claim.key}: marked in README but not a known figure`);
}
for (const key of Object.keys(actual)) {
  const forKey = claims.filter((c) => c.key === key);
  if (forKey.length === 0) {
    failures.push(`  ${key}: no longer marked anywhere in the README`);
    continue;
  }
  for (const claim of forKey) {
    if (claim.value !== actual[key]) {
      failures.push(
        `  ${key}: README says ${claim.value}, actual is ${actual[key]}`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    `README states ${failures.length} number(s) that are no longer true:\n` +
      `${failures.join("\n")}\n\n` +
      `Update README.md, or the marker, so the claim matches reality.`
  );
  process.exit(1);
}

const summary = Object.entries(actual)
  .map(([k, v]) => `${k}=${v}`)
  .join("  ");
console.log(`README numbers check: ${claims.length} claims verified`);
console.log(`  ${summary}`);
