# Aura Weather — Follow-Up Audit

**Date:** 2026-07-27
**Baseline:** `origin/main` @ `908cc8d` (67 commits past the 2026-07-03 audit baseline `10a2303`)
**Method:** Full local quality-gate run (`lint`, `test`, `test:components`, `build`) on a clean
`npm ci`, plus static passes (trust-contract compliance, dependency health, design-token drift,
hygiene) and file:line verification of every finding from the 2026-07-03 production-readiness
audit. Browser-tier gates (Playwright E2E + axe accessibility + visual regression, Lighthouse
budgets) were verified via the live CI runs on this exact commit rather than re-run locally.
**Lens:** Same as the prior audit — a production app with real users, reviewed by hiring managers.

---

## 0. Headline

**All quality gates pass.** Locally: ESLint clean, 568/568 unit tests, 216/216 render tests,
production build green (6.8s). In CI at `908cc8d`: `browser-quality` (E2E, axe, visual,
screenshot-drift gate) and `lighthouse-budget` both **success**.

**The 2026-07-03 audit has been essentially fully remediated.** F1–F12, F14, and F15 are
verified fixed in current source with file:line evidence (§1). Escalation E1 (jsonblob sync) is
resolved — backup now resolves through the Supabase session JWT with a v1→v2 account-key
migration. The only surviving item from the prior audit is one Low-tier fragment of F13.

What this audit adds is a short list of **new findings**: one trust-contract inconsistency that
predates the prior audit but was not caught by it (N1), and four hygiene/presentability items
(N2–N5) that matter mostly because this repo's brand *is* discipline.

There are **no Critical or High findings**.

---

## 1. Verification of 2026-07-03 findings

| ID | Was | Status | Evidence on `main` |
|---|---|---|---|
| F1 | High — hero chips double-convert units | **Fixed** | `buildHeroData.js:398,416` — chips classify against raw °F/mph (`dpF = dewPoint`, `wMph = windSpeed`) |
| F2 | High — rain totals use device midnight | **Fixed** | `useRainAnalysis.js:38,58` — `analyzeRain(hourly, timeZone, now)` derives day start via `getZonedNow` |
| F3 | Medium — nowcast plots 0% over gaps | **Fixed** | `analyzeNowcast.js:132` — series carries `null` through; the line gaps at missing slots |
| F4 | High — getters write to localStorage | **Fixed** | `useLocation.js` — reads are pure; writes moved to explicit `persistSavedCities` / `persistRecentCities` |
| F5 | High — refresh listeners churn per city | **Fixed** | `useWeatherData.js:608` — effect depends only on `[backgroundRefreshEnabled, enabled]` |
| F6 | Medium — `clampProbability(NaN)` → 0 | **Fixed** | `analyzeNowcast.js:9–14` — non-finite returns `null`, with a comment pinning the contract |
| F7 | High — ~24 tab stops per chart | **Fixed** | Roving tabindex in both charts: `HourlyCard.jsx:483,520`, `RainCard.jsx:458,528` |
| F8 | Medium — alert card `<h3>` skips a level | **Fixed** | `AlertsCard.jsx:98` — `<h2>` with an inline comment documenting the outline rule |
| F9 | Medium — radar interval runs when hidden | **Fixed** | `useRadarAnimation.js:80–90` — advance pauses on `document.hidden` |
| F10 | Medium — every radar frame eager-loads | **Mitigated** | `RadarMap.jsx:142` — `updateWhenIdle={!isActive}`; only the visible frame loads eagerly |
| F11 | Medium — `uvPanel` computed, never shown | **Fixed** | `HeroCard.jsx:407–412` — UV panel renders (design placement resolved) |
| F12 | Medium — Storm Watch bespoke severity scale | **Fixed** | `StormWatch.jsx:172` — shared `severity-badge severity-badge--{tone}` |
| F13 | Low — misc cluster | **Partially open** | See N6 — the in-flight-abort item survives; the rest are immaterial or addressed |
| F14 | Medium — Edge Function fails open | **Fixed** | `check-rain-alerts/index.ts:155–158` — fails closed when `CRON_SECRET` unset |
| F15 | Low — threshold `0` coerced to 50 | **Fixed** | `index.ts:85–92` — `Number.isFinite` check; `0` means "any rain chance" |
| E1 | Escalation — jsonblob sync privacy | **Resolved** | `useSavedLocationsSync.js` — Supabase-JWT-resolved backup, v1→v2 key migration; jsonblob survives only in explanatory comments |
| E2/E3 | Escalations — IA / design placements | **Closed by decision** | E3's uvPanel placement shipped (F11); E2 remains an intentional-breadth call |
| E4 | Escalation — AGENTS.md overwrite risk | **Resolved** | Authoritative `AGENTS.md` intact, and now backed by `eslint-plugin-boundaries` (`7c0130b`) enforcing the dependency chain mechanically |

Sixty-seven commits landed since the baseline, including EPA-scale AQI correction (`699b072`),
wind-reading validation before derivation (`675a9f7`), lazy-panel E2E stabilization, and the
screenshot-drift CI gate (PR #123). The remediation record is complete enough that this audit's
findings are all new.

---

## 2. New findings (ranked)

**N1 · [Medium] `sameLocation` coerces stored rule coordinates with raw `Number()`**
`src/hooks/useRainAlerts.js:17–18`
```js
Math.abs(Number(rule.location_lat) - Number(location?.lat)) < 1e-4 &&
Math.abs(Number(rule.location_lon) - Number(location?.lon)) < 1e-4
```
`rule` rows come from Supabase via `listRules` — external data under the contract. A rule row
with `null` coordinates coerces to `(0, 0)` and is treated as a real place (Null Island) rather
than an invalid rule; `HeaderControls.jsx:47` documents this exact trap, and F15 fixed the same
class server-side. Blast radius is small (worst case: alert toggles reflect the wrong rule for a
location), but this is the one remaining raw-`Number()` on external data in `src/`, in the repo
whose headline promise is that this never happens.
*Fix:* run both sides through `toFiniteNumber`; a rule with non-finite coordinates must match
nothing. One unit test pins it.

**N2 · [Medium] 7 dev-dependency vulnerabilities (6 high, 1 low) via `lighthouse@12.6.1`**
`npm audit` — all seven resolve to `ws@7.5.10` / `ws@8.20.0` under
`lighthouse → puppeteer-core`. Runtime dependencies are **clean** (`npm audit --omit=dev`: 0),
so shipped users are unaffected — but the GitHub security tab and any reviewer running
`npm audit` see "6 high." *Fix:* bump `lighthouse` (12.8.2 satisfies the current range; 13.4.1
is latest), re-run `npm run test:lighthouse` to confirm the budget script still passes, and
confirm `npm audit` reports 0.

**N3 · [Medium] CHANGELOG and version have not moved since `1.0.0` (2026-07-03)**
`CHANGELOG.md` has no `[Unreleased]` section; `package.json` is still `1.0.0` — while 67 commits
landed, including user-visible correctness fixes (EPA AQI scale) and features (atmosphere
explanations, bento help). For a repo that showcases release discipline, the CHANGELOG is the
first place a reviewer checks against `git log`, and right now they disagree. *Fix:* add an
`[Unreleased]` section summarizing the post-1.0.0 batches, or cut `1.1.0` (the AQI fix alone
justifies it).

**N4 · [Medium] Design-token drift: 202 raw hex values in component CSS**
`App.css` defines the token layer (142 custom properties, 781 `var()` references) and
`GLACIER_BUILD_SPEC.md` §1 mandates "Put them in the token layer… Do not approximate." The
accent migration (`#8bd3ff` → `#6fb7f2`) is complete at the grep level, but 202 hex literals
remain outside the token layer. Top offenders:

| Raw hex | File |
|---|---|
| 27 | `components/HeroCard.css` |
| 26 | `components/HourlyCard.css` |
| 21 | `components/layout/AppHeader.css` |
| 18 | `components/layout/StatusStack.css` |
| 14 | `components/radar/RadarPanel.css` |
| 14 | `components/MetricPanels.css` |

Not a bug — but it is exactly the debt class the CodeHerWay platform tracks, and the next
palette decision (a second Glacier accent change) would require another repo-wide grep instead
of a one-line token edit. *Fix:* phased tokenization, visual-baseline-gated, starting with
`HeroCard.css` + `HourlyCard.css` (53 of 202). Per `AGENTS.md`, this is a mechanical
substitution pass, not a visual redesign — values map to existing tokens; anything without a
token match gets escalated, not invented.

**N5 · [Low] Dependency currency**
Vite `6.4.2` (latest `8.1.5` — two majors), ESLint `9 → 10`, `@vitejs/plugin-react` `4 → 6`,
`jsdom 29 → 30`, `@testing-library/jest-dom 6 → 7`. Nothing here is urgent or vulnerable at
runtime; batch the minors, and treat the Vite 8 migration as its own scoped branch (the
`--configLoader runner` flag and the manual-chunks config need verification under 8).

**N6 · [Low] F13 residual: `useRainAlerts` still doesn't abort in-flight backend calls on
location change** (`useRainAlerts.js` — no `AbortController`/request-id discipline, unlike the
weather fetch layer). Same Low severity as originally filed. The other F13 micro-items are
immaterial: `getDateInTimeZone` now assigns `monthDay` on success paths; `sunlight.js:26` still
reads `Date.now()` but inside a bounds guard, cosmetic at most.

---

## 3. Fresh strengths worth naming

- **The CI is now part of the portfolio story.** The screenshot-drift gate (README images
  compared against the rendered app with tolerance, failing on size changes), the manual
  `refresh-visual-baselines` job that deliberately keeps a human in the review loop, and the
  recorded trust-contract demo pipeline are the kind of operational judgment reviewers rarely
  see in a solo project.
- **Architecture boundaries are now machine-enforced.** `eslint-plugin-boundaries` (`7c0130b`)
  turns the AGENTS.md dependency chain (components → hooks → api/services → utils/domain) from
  a convention into a lint failure.
- **Bundle strategy is deliberate and healthy.** React vendor + icon set split for long-cache
  hashing; the Leaflet/radar stack (166KB) lazy-loads; initial gzipped JS lands around
  ~158KB before deferred panels.
- **Zero `console.log`/`TODO`/`FIXME` in `src/`.** The repo reads finished.

---

## 4. Remediation plan

One concern per branch/PR off `main`; each verified with
`npm run lint && npm test && npm run test:components && npm run build` before push, then CI's
browser tier confirms the rest.

| Order | Branch | Scope | Finding |
|---|---|---|---|
| 1 | `fix/rain-alerts-coordinate-trust` | `toFiniteNumber` in `sameLocation` + unit test | N1 |
| 2 | `chore/lighthouse-ws-advisories` | Bump `lighthouse`, verify budgets, `npm audit` → 0 | N2 |
| 3 | `docs/changelog-unreleased` | `[Unreleased]` entries (or cut `1.1.0`) | N3 |
| 4 | `style/tokenize-hero-hourly` | Tokenize `HeroCard.css` + `HourlyCard.css`; baseline-gated | N4 (phase 1) |
| later | `chore/vite-8-migration` | Own scoped branch; config + chunk verification | N5 |
| later | `fix/rain-alerts-abort` | Abort in-flight rule calls on location change | N6 |

Items 1–3 are each under an hour and together take the repo to: zero raw-`Number()` on external
data, zero audit advisories, and a CHANGELOG that matches `main`.
