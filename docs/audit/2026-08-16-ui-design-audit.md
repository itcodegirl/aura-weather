# Aura Weather — UI/UX & Design Audit

**Date:** 2026-08-16
**Baseline:** `main` @ `52913cf` (post token-consolidation, PR #139)
**Method:** Full quality-gate run on a clean `npm ci` (`lint`, `test` 583/583, `build`,
`test:e2e --workers=1` incl. axe + visual regression — all green), review of the committed
visual baselines (desktop / tablet / mobile / trust-contract), file:line verification of every
open item from the 2026-06-26 product-UX audit and the 2026-07-27 follow-up, and a fresh pass
over the rubric a hiring manager would apply: hierarchy, states, responsiveness, accessibility,
and product decision support.
**Lens:** "Would this survive a senior frontend design review, and does anything still separate
it from portfolio-ready?"

---

## A. Current state summary

Aura is past the point where a general "make it professional" pass applies. The Glacier design
system is real (140+ custom properties, radius/shadow/spacing scales, six breakpoints down to
420px, `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors`, hover-capability
queries). The unhappy paths are first-class: per-panel error boundaries, honest cached/stale
labels, a deterministic `?mock=missing` demo, skeleton fallbacks per card. Accessibility is
enforced in CI via axe on both the live and missing-data states, and the keyboard work
(combobox search, roving-tabindex charts, escape-to-collapse rows) is beyond checkbox level.

The correct read for this audit is therefore **verification plus residue**, not redesign.
Nearly every item from the two prior audits is verified fixed in current source (§D). What
remains is a short list: one objective dependency-hygiene item (fixed in this PR), two items
that are open **by design decision** and need a human call rather than agent implementation,
and one release-discipline item.

## B. Strengths (verified, not aspirational)

1. **Hero answers the daily-decision question.** `dailyGuidance` renders as a guidance list
   (`HeroCard.jsx:382-384`) — rain gear / sun protection / wind, the prior audit's top gap.
2. **The trust pill is honest.** Four-state classification — "High confidence" / "Saved
   forecast" / "Confidence fading" / "Current data unavailable" — with headline-absence
   outranking freshness (`HeroCard.jsx:193-233`).
3. **One severity language.** Nowcast, Storm Watch, and Alerts share the `severity-badge`
   scale; the "Rain likely" threshold is 50% app-wide (`NowcastCard.jsx:13-17`).
4. **States are complete.** Loading skeletons per panel, 7s "still working" reassurance,
   onboarding empty state, per-panel degradation, offline snapshot labeled "Saved", the
   `?mock=missing` route proving all of it.
5. **Responsive design is designed, not squeezed.** Verified baselines at desktop/tablet/
   mobile; an e2e test pins the mobile dashboard inside the viewport width
   (`weather-smoke.spec.js:417`).
6. **Accessibility is tested, not claimed.** axe in CI on live + missing states, focus
   restoration, scoped live regions, `aria-busy`, missing-value announcements, 43
   `:focus-visible` rules, reduced-motion coverage in 13 stylesheets.
7. **Architecture boundaries are machine-enforced** (`eslint-plugin-boundaries`), and the
   token layer was consolidated deliberately, with the stopping point documented (PR #139).

## C. Weaknesses / what still stands between this and "done"

None of these are layout, contrast, or state gaps — those are closed. What remains:

1. **Dev-dependency advisories regressed since July** (fixed in this PR — see §F).
   `lighthouse@12.6.1` pinned `ws`, `@sentry/node`, and OpenTelemetry versions that the
   current advisory DB flags: `npm audit` showed **7 high** before this pass. Runtime deps
   were always clean, but the GitHub security tab is part of a portfolio repo's first
   impression.
2. **The brand block still explains mood, not meaning.** "Aura / Atmospheric Intelligence"
   (`AppHeader.jsx:44`) has no plain value line. The 2026-06-26 audit recommended e.g.
   *"Today's conditions, honest about what it doesn't know."* Still open; this is a
   copywriting/brand call, so it is reported here rather than implemented (AGENTS.md: agents
   do not make subjective design decisions).
3. **Dashboard breadth remains the one debatable IA call.** Six surfaces still touch
   precipitation (hourly precip tab, radar, nowcast, rain outlook, storm watch, weekly rain
   %). The 2026-07-27 audit records this as an intentional-breadth decision (E2), and the
   modules are now visually ranked and consistently labeled — but a reviewer optimizing for
   "sharp" over "broad" would still merge Nowcast + Rain Outlook into one progressive
   surface. Decision, not defect.
4. **Release discipline lags the work.** `package.json` is `1.0.0` while `CHANGELOG.md`
   carries a large `[Unreleased]` section (the July audit's N3, half-addressed). The EPA AQI
   correction alone justified `1.1.0`. Cutting a release is the owner's call.
5. *(Cosmetic)* `repair-dev.ps1` sits at the repo root; `scripts/` would keep the root
   surface tidy for reviewers.

## D. Prior-audit verification table

| Item (origin) | Status | Evidence |
|---|---|---|
| Hero drops computed daily guidance (UX #1) | **Fixed** | `HeroCard.jsx:382` renders `dailyGuidance` list |
| Unconditional "High confidence" pill (UX #9) | **Fixed** | `HeroCard.jsx:219-233` four-state pill |
| Empty Moon tile (UX #7) | **Fixed** | no moon tile in `AtmosphereBento.jsx` |
| "Risk Signals" label mismatch (UX #3) | **Fixed** | `SupplementalWeatherPanels.jsx:137` "Atmospheric Conditions" |
| Nowcast 40% vs 50% threshold (UX #10) | **Fixed** | `NowcastCard.jsx:13-17` |
| Ambiguous "Start" chip control (UX #5) | **Fixed** | "Set startup" + explained badge, `SavedCitiesStrip.jsx:218-235` |
| Search idle-state grammar (UX 4.3) | **Fixed** | `CitySearch.jsx:388` |
| Reverse-geocode silent fallback (UX #8) | **Fixed** | naming-failure hint, `useLocation.js:19-22` |
| Wind unit hidden on collapsed row (UX #10) | **Moot** | collapsed rows no longer show wind; unit lives in details |
| `sameLocation` raw `Number()` (N1) | **Fixed** | `rainAlertHelpers.js:12-20` uses `toFiniteNumber` |
| Lighthouse `ws` advisories (N2) | **Fixed in this PR** | lighthouse 13.4.1 + `npm audit fix`; `npm audit` → 0 |
| CHANGELOG stagnant (N3) | **Partially open** | `[Unreleased]` exists; version still 1.0.0 |
| Token drift (N4) | **Closed by decision** | PRs #135–#139; stopping point documented in `fe9ed35` |
| Dependency currency (N5) | **Fixed** | Vite 8, ESLint 10, plugin-react 6, jsdom 30 |
| Rain-alerts abort discipline (N6) | **Fixed** | `createAlertRequestTracker`, `rainAlertHelpers.js:26-58` |
| Brand value one-liner (UX 4.1) | **Open — design call** | `AppHeader.jsx:44` |
| Breadth vs. sharpness (UX #2 / E2) | **Open — deliberate** | six precip surfaces, ranked but all present |

## E. Priority list

- 🔴 **Critical:** none found. Layout, hierarchy, mobile, contrast, states, and a11y all
  verified green by gates that would fail if they regressed.
- 🟡 **Important:**
  1. ~~Dev-dependency advisories (7 high)~~ — fixed in this PR.
  2. Brand value one-liner — needs an owner-approved copy decision.
  3. Cut `1.1.0` so the CHANGELOG and version agree.
- ⚪ **Optional:**
  4. Revisit the breadth-vs-sharpness call (merge Nowcast + Rain Outlook) if the portfolio
     story should read "editing" over "coverage".
  5. Move `repair-dev.ps1` into `scripts/`.
  6. Light theme / saved-location comparison / charts — genuinely optional; the dark-only
     decision is documented in `index.html` and defensible.

## F. Changed in this pass

Scope deliberately narrow per AGENTS.md (no subjective visual changes without human design
direction):

1. **`chore(deps): lighthouse 12.6.1 → 13.4.1 + audit fix`** — clears all 7 high advisories;
   `npm audit` now reports 0 across dev and runtime. Budget script API
   (`import lighthouse, { desktopConfig }`) unchanged across the major; verified by running
   the budget gate locally.
2. **This document** — the verification record for the audit date.

## G. Recommendation to the owner

The app is portfolio-ready by the standards this audit was asked to apply. The three moves
that would still raise it: (1) approve a one-line value proposition for the header; (2) tag
`1.1.0`; (3) decide the breadth question once, in the case study — either defend the six rain
surfaces as deliberate coverage or fold two of them and tell the editing story. All three are
decisions, not engineering.
