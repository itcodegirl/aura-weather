# Aura Weather — UI/UX & Design Audit

**Date:** 2026-08-16
**Baseline:** `main` @ `52913cf` (post token-consolidation, PR #139)
**Method:** Full local quality-gate run on a clean `npm ci` (`lint`, `test` 583/583, `render`
219/219, `build` — all green); the browser tier (e2e + axe + visual regression) verified via
the green `browser-quality` CI run on this exact tree rather than locally — the audit
container's pre-installed Chromium build does not match the pinned Playwright's expected
build, so local browser runs are not authoritative here. Also: review of the committed
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
2. ~~**The brand block still explains mood, not meaning.**~~ "Aura / Atmospheric
   Intelligence" carried no plain value line. Raised by all three audits; reported rather
   than implemented because copy is an owner call. **Closed** — the owner approved
   *"Today's conditions, honest about what it doesn't know."* and it now renders beneath
   the tagline.
3. **Dashboard breadth remains the one debatable IA call.** Six surfaces still touch
   precipitation (hourly precip tab, radar, nowcast, rain outlook, storm watch, weekly rain
   %). The 2026-07-27 audit records this as an intentional-breadth decision (E2), and the
   modules are now visually ranked and consistently labeled — but a reviewer optimizing for
   "sharp" over "broad" would still merge Nowcast + Rain Outlook into one progressive
   surface. Decision, not defect.
4. **Release discipline lags the work.** `package.json` is `1.0.0` while `CHANGELOG.md`
   carries a large `[Unreleased]` section (the July audit's N3, half-addressed). The EPA AQI
   correction alone justified `1.1.0`. Cutting a release is the owner's call.
5. ~~*(Cosmetic)* `repair-dev.ps1` sits at the repo root~~ — **closed**; moved into
   `scripts/`, with its project-root resolution corrected for the new depth.

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
  1. ~~Dev-dependency advisories (7 high)~~ — fixed; `npm audit` reports 0.
  2. ~~Brand value one-liner~~ — approved by the owner and shipped.
  3. ~~Cut `1.1.0` so the CHANGELOG and version agree~~ — released 2026-08-17.
- ⚪ **Optional:**
  4. ~~Revisit the breadth-vs-sharpness call~~ — decided: keep all six precipitation
     surfaces, recorded in `docs/case-study.md` with the trigger that would reverse it.
  5. ~~Move `repair-dev.ps1` into `scripts/`~~ — moved.
  6. Light theme / saved-location comparison / charts — genuinely optional; the dark-only
     decision is documented in `index.html` and defensible.

**Every item this audit raised is now closed.** The remaining entry is a standing
"could build more" note, not a finding.

## E1. Follow-up: visual regression testing removed (2026-08-20)

The owner decided to drop screenshot-comparison testing entirely. It is worth recording
honestly, because §B of this audit counted it as a strength and the README advertised it.

**What happened.** The value line moved rendered pixels, which is exactly what the
visual gate is designed to catch. Clearing it required re-recording five committed
baselines, and the recording could only be done in CI — the agent environment cannot
reach the map-tile hosts the captures include, and the repo's own rule required a human
to review any baseline update. That put a one-line copy change behind a multi-step manual
chore, and the chore was repeated three times across this branch.

**The decision.** Remove the visual-regression spec, its five baselines, the README
screenshot-drift gate, and the manual baseline-refresh job; drop the corresponding README
claims and the `AGENTS.md` rule that referenced baselines.

**What is lost.** Nothing else catches an unintended layout move — a CSS change that
shifts the hero or breaks a grid now reaches `main` unflagged. The remaining Playwright
suite covers behaviour and accessibility, not appearance. That is a real reduction in
coverage, accepted deliberately in exchange for removing the friction.

**If it is ever reinstated,** the workable shape is a `refresh-visual-baselines` job that
commits its own output on a branch, so a UI change costs one workflow run rather than a
download-review-commit cycle. The screenshot generation script (`npm run screenshots`) and
the CI artifact that carries regenerated README images both remain.

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
