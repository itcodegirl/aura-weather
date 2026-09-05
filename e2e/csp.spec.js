import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import {
  installOpenMeteoMocks,
  mockDeniedGeolocation,
} from "./support/openMeteoMocks.js";

/**
 * Boots the real dashboard under the real Content-Security-Policy and fails
 * on anything the browser refuses.
 *
 * `public/_headers` is applied by the host at the edge. `vite preview` does
 * not read it, so the policy the app actually ships under is exercised by
 * nothing: a directive too narrow fails in production and passes everywhere
 * else. That is the whole reason the CSP had been deferred.
 *
 * So the policy is read from the file it ships in -- never restated here,
 * or this would drift into testing a copy -- and attached to the document
 * response on its way to the browser. From that point the enforcement is the
 * browser's own: `securitypolicyviolation` fires for every blocked fetch,
 * style, image, script or worker, and each one fails this spec with the
 * directive that blocked it.
 *
 * What it cannot cover: only the paths these tests walk. A provider that no
 * test visits is covered instead by `src/contentSecurityPolicy.test.mjs`,
 * which re-derives the origins from `src/api/` without a browser.
 */

const HEADERS_FILE = fileURLToPath(new URL("../public/_headers", import.meta.url));

function shippedPolicy() {
  const line = readFileSync(HEADERS_FILE, "utf8")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("Content-Security-Policy:"));
  if (!line) {
    throw new Error("public/_headers no longer ships a Content-Security-Policy");
  }
  return line.slice("Content-Security-Policy:".length).trim();
}

/**
 * Serves the app's own documents with the shipped policy attached, and
 * collects every violation the browser reports.
 *
 * The listener is registered through addInitScript so it is in place before
 * any of the page's own code runs -- a violation during first paint would
 * otherwise happen before an ordinary evaluate() could attach anything.
 */
async function applyShippedPolicy(page) {
  const policy = shippedPolicy();

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective || event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document") {
      return route.fallback();
    }
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": policy,
      },
    });
  });

  return async () => page.evaluate(() => window.__cspViolations ?? []);
}

test.describe("Content-Security-Policy", () => {
  test("the dashboard boots with nothing blocked", async ({ page, context }) => {
    await mockDeniedGeolocation(context);
    const violations = await applyShippedPolicy(page);
    await installOpenMeteoMocks(page);

    await page.goto("/");
    await expect(page.locator(".hero-card")).toBeVisible();
    await expect(page.locator(".bento")).toBeVisible();

    expect(await violations()).toEqual([]);
  });

  test("the policy is actually being enforced on this page", async ({
    page,
    context,
  }) => {
    /*
     * A control. Every other assertion here is that a list is empty, which is
     * exactly what a policy that never arrived also produces -- a typo in the
     * header name, a route that stopped matching the document, and this spec
     * would pass while testing nothing. So: inject a script the policy must
     * refuse, and require the refusal.
     */
    await mockDeniedGeolocation(context);
    const violations = await applyShippedPolicy(page);
    await installOpenMeteoMocks(page);

    await page.goto("/");
    await expect(page.locator(".hero-card")).toBeVisible();

    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__cspControlRan = true;";
      document.head.appendChild(script);
    });

    expect(await page.evaluate(() => window.__cspControlRan)).toBeUndefined();

    // Chromium reports the most specific directive that applied, so an inline
    // <script> element is refused under script-src-elem even though the
    // policy only names its script-src fallback. Accept either rather than
    // pinning one engine's choice of label.
    const reported = await violations();
    expect(
      reported.some((entry) => entry.directive.startsWith("script-src"))
    ).toBe(true);
  });

  test("nothing is blocked while the user works through the app", async ({
    page,
    context,
  }) => {
    /*
     * First paint alone would miss the directives that only matter later:
     * the lazily-imported panels (script-src on a chunk fetched on demand),
     * a city search (connect-src to the geocoding origin), and the saved
     * cities the search writes.
     */
    await mockDeniedGeolocation(context);
    const violations = await applyShippedPolicy(page);
    await installOpenMeteoMocks(page);

    await page.goto("/");
    await expect(page.locator(".hero-card")).toBeVisible();

    const search = page.getByRole("combobox", { name: /search/i });
    await search.fill("Tokyo");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByRole("option").first().click();

    await expect(page.locator(".hero-card")).toBeVisible();
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(750);

    expect(await violations()).toEqual([]);
  });
});
