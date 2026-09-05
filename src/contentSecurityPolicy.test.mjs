import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Keeps the shipped Content-Security-Policy honest about what the app
 * actually talks to.
 *
 * The policy lives in `public/_headers`, which no test runner and no build
 * step reads — it is applied by the host at the edge, so a wrong value fails
 * in production and nowhere earlier. The specific way it goes wrong is
 * predictable: someone adds a provider to `src/api/`, ships it, and the
 * fetch is blocked in production only. `e2e/csp.spec.js` catches what a real
 * browser refuses on the paths it exercises; this catches the provider that
 * was added but not wired into the policy, without needing a browser at all.
 *
 * The origins are re-derived from the provider layer rather than restated
 * here, so this cannot drift into agreeing with a stale copy of itself.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_DIR = join(ROOT, "src", "api");

function readPolicy() {
  const headers = readFileSync(join(ROOT, "public", "_headers"), "utf8");
  const line = headers
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("Content-Security-Policy:"));
  assert.ok(line, "public/_headers no longer ships a Content-Security-Policy");
  return line.slice("Content-Security-Policy:".length).trim();
}

function parseDirectives(policy) {
  const directives = new Map();
  for (const chunk of policy.split(";")) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    directives.set(parts[0], parts.slice(1));
  }
  return directives;
}

/** Every https:// origin literal in the provider layer, test files excluded. */
function providerOrigins() {
  const origins = new Set();
  for (const entry of readdirSync(API_DIR)) {
    if (!entry.endsWith(".js") || entry.includes(".test.")) continue;
    const source = readFileSync(join(API_DIR, entry), "utf8");
    for (const match of source.matchAll(/https:\/\/[a-z0-9.-]+/gi)) {
      origins.add(match[0]);
    }
  }
  return [...origins].sort();
}

/**
 * CSP source matching, narrowed to the two forms this policy uses: an exact
 * origin, and a single leading-label wildcard. `*.example.com` matches a
 * subdomain but never the bare apex, which is the rule browsers apply.
 */
function allowedBy(sources, origin) {
  const host = new URL(origin).hostname;
  return sources.some((source) => {
    if (!source.startsWith("https://")) return false;
    const pattern = source.slice("https://".length);
    if (!pattern.startsWith("*.")) return pattern === host;
    const suffix = pattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  });
}

const policy = readPolicy();
const directives = parseDirectives(policy);

describe("Content-Security-Policy", () => {
  test("the scan found a policy with the directives it is meant to check", () => {
    const required = [
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "connect-src",
      "frame-ancestors",
      "object-src",
      "base-uri",
    ];
    const missing = required.filter((name) => !directives.has(name));
    assert.deepEqual(missing, [], `policy is missing: ${missing.join(", ")}`);

    const found = providerOrigins();
    assert.ok(
      found.length >= 6,
      `expected the provider origins, found ${found.length}: ${found.join(", ")}`
    );
  });

  test("connect-src covers every origin the provider layer fetches", () => {
    const sources = directives.get("connect-src") ?? [];
    const blocked = providerOrigins().filter(
      (origin) => !allowedBy(sources, origin)
    );

    assert.deepEqual(
      blocked,
      [],
      `these origins are fetched by src/api/ but connect-src would block ` +
        `them in production:\n  ${blocked.join("\n  ")}`
    );
  });

  test("img-src covers the tile vendors, whose hosts arrive at runtime", () => {
    /*
     * Neither tile host can be derived like the origins above. RainViewer's
     * catalogue returns the tile host as a field, and the basemap URL is a
     * template with an `{s}` subdomain placeholder — so both are wildcards in
     * the policy by necessity, and this states the two vendors on purpose.
     */
    const sources = directives.get("img-src") ?? [];
    for (const origin of [
      "https://tilecache.rainviewer.com",
      "https://a.basemaps.cartocdn.com",
    ]) {
      assert.ok(
        allowedBy(sources, origin),
        `img-src would block radar tiles from ${origin}`
      );
    }
  });

  test("scripts get no inline exemption", () => {
    /*
     * style-src carries 'unsafe-inline' and has to: the built index.html
     * ships an inline <style>, and React writes inline style attributes.
     * Scripts have no such constraint — there is not one inline script in the
     * built output — so an 'unsafe-inline' appearing here later would be the
     * single change that gives most of the policy's XSS value back.
     */
    const scriptSources = directives.get("script-src") ?? [];
    assert.ok(
      !scriptSources.includes("'unsafe-inline'"),
      "script-src must not allow inline scripts"
    );
    assert.ok(
      !scriptSources.includes("'unsafe-eval'"),
      "script-src must not allow eval"
    );
    assert.deepEqual(directives.get("object-src"), ["'none'"]);
  });
});
