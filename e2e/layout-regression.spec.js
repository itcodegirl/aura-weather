import { test, expect } from "@playwright/test";

/*
 * Assertion-based layout guards.
 *
 * These replace part of what the deleted screenshot baselines protected —
 * reflow, clipping, and "did the lazy panels actually arrive" — without
 * committing binaries or needing a re-record chore after every intentional
 * UI change.
 *
 * Deliberately NOT re-implemented here: page-level horizontal overflow.
 * weather-smoke.spec.js already asserts it, and that assertion was verified
 * to fail on a deliberately injected 900px element at a 390px viewport, so
 * it is a real guard rather than a tautology despite body { overflow-x:
 * hidden }.
 */

const VIEWPORTS = [
  { name: "small-mobile", width: 320, height: 720 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 900, height: 1200 },
];

// Containers that scroll horizontally on purpose. Their children are
// legitimately wider than the box, so they are excluded from clipping checks.
const SCROLLER_SELECTORS = [
  ".hourly-scroll",
  ".hourly-track",
  ".rain-touch-strip",
  ".hourly-touch-strip",
  ".saved-cities-strip",
  ".leaflet-container",
];

async function gotoDashboard(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  // The missing-data route is deterministic and hits no live provider, so
  // these assertions are about layout rather than about today's weather.
  await page.goto("/?mock=missing");
  await expect(page.locator(".app-inner")).toBeVisible();
  await expect(page.locator(".hero-card")).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`text is not clipped at ${viewport.name}`, async ({ page }) => {
    await gotoDashboard(page, viewport);

    const clipped = await page.evaluate((scrollers) => {
      const inScroller = (el) =>
        scrollers.some((sel) => el.closest(sel) !== null);

      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length > 0) continue; // leaf nodes carry the text
        const text = (el.textContent || "").trim();
        if (!text) continue;
        if (el.classList.contains("sr-only")) continue; // 1px by design
        if (inScroller(el)) continue;

        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        // Ellipsis truncation is a deliberate design choice, not a bug.
        if (style.textOverflow === "ellipsis") continue;
        if (style.overflow !== "visible" && style.overflow !== "") continue;

        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
          offenders.push(
            `${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth} "${text.slice(0, 40)}"`
          );
        }
      }
      return offenders;
    }, SCROLLER_SELECTORS);

    expect(clipped, `clipped text at ${viewport.width}px`).toEqual([]);
  });
}

test("the hero fits on a phone screen without dominating it", async ({ page }) => {
  // This is the guard that would have caught the header value-line churn
  // (added, reverted, restored) without re-recording a single baseline.
  await gotoDashboard(page, { name: "mobile", width: 390, height: 844 });

  const hero = await page.locator(".hero-card").boundingBox();
  expect(hero).not.toBeNull();
  expect(
    hero.height,
    "hero should not swallow the whole first screen"
  ).toBeLessThan(844 * 0.95);
  expect(hero.width).toBeLessThanOrEqual(390);

  // The temperature is the largest type on the page and the first thing to
  // overflow when the shell tightens.
  const tempClipped = await page.evaluate(() => {
    const el = document.querySelector(".hero-temp");
    if (!el) return null;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(tempClipped, "hero temperature is clipped").toBe(false);
});

test("every atmosphere tile arrives, so a missing lazy chunk cannot pass silently", async ({
  page,
}) => {
  // A late chunk once rendered the dashboard ~749px shorter with the bento
  // simply absent. Nothing failed, because no test asserted the panels
  // mounted at all.
  await gotoDashboard(page, { name: "mobile", width: 390, height: 844 });

  const tiles = page.locator(".bento-atm .atm-tile");
  await expect(tiles).toHaveCount(8, { timeout: 20_000 });
});

/*
 * Open every help drawer and prove the panel stays inside both the viewport
 * and its own card.
 *
 * The guards above only ever saw the collapsed state, which is why this went
 * unnoticed: the panel sat in normal flow inside an inline-flex title row, so
 * its width pushed it off the right edge of the screen — measured at 320px,
 * the radar panel ended 91.8px past the viewport — and `body { overflow-x:
 * hidden }` clipped the evidence into what looked like truncated text.
 */
for (const viewport of VIEWPORTS) {
  test(`open help drawers stay inside the viewport at ${viewport.name}`, async ({
    page,
  }) => {
    await gotoDashboard(page, viewport);

    // The drawers live in lazily-deferred panels, so wait for the bento to
    // arrive before counting — otherwise this passes vacuously against an
    // empty page.
    await expect(page.locator(".bento-atm .atm-tile")).toHaveCount(8, {
      timeout: 20_000,
    });

    const triggers = page.locator(".info-drawer-trigger");
    const count = await triggers.count();
    expect(count, "the dashboard should render help drawers to check").toBeGreaterThan(0);

    const failures = [];

    for (let i = 0; i < count; i += 1) {
      const trigger = triggers.nth(i);
      if (!(await trigger.isVisible())) continue;

      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();

      const geometry = await page.evaluate(() => {
        const panel = document.querySelector(".info-drawer-panel");
        if (!panel) return null;
        const card = panel.closest(".glass");
        const p = panel.getBoundingClientRect();
        const c = card ? card.getBoundingClientRect() : null;
        return {
          label: panel.parentElement?.className ?? "info-drawer",
          left: p.left,
          right: p.right,
          cardLeft: c ? c.left : null,
          cardRight: c ? c.right : null,
        };
      });

      if (geometry) {
        const past = [];
        if (geometry.right > viewport.width + 0.5) {
          past.push(`${(geometry.right - viewport.width).toFixed(1)}px past the right edge`);
        }
        if (geometry.left < -0.5) {
          past.push(`${(-geometry.left).toFixed(1)}px past the left edge`);
        }
        // Anchored to its card, so it must not escape the card either —
        // this catches a regression that a wider viewport would hide.
        if (geometry.cardRight !== null && geometry.right > geometry.cardRight + 1) {
          past.push("outside its card's right edge");
        }
        if (geometry.cardLeft !== null && geometry.left < geometry.cardLeft - 1) {
          past.push("outside its card's left edge");
        }
        if (past.length) failures.push(`${geometry.label}: ${past.join(", ")}`);
      }

      await page.keyboard.press("Escape");
    }

    expect(failures, failures.join(" | ")).toEqual([]);
  });
}
