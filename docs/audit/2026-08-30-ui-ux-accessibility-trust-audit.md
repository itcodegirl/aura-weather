# Aura Weather — UI/UX, Accessibility, Trust & Portfolio Audit

**Date:** 2026-08-30 · **Status updated:** 2026-09-01 (see §I)
**Branch:** `claude/aura-weather-audit-fvswev`
**Base:** `33a7ab7` (`origin/main`, PR #169)
**Node:** v22.22.2 · **npm:** 10.9.7

> **Where this stands.** The findings, evidence and measurements below are a
> record of 2026-08-30 and are left as written. Only the **status markers** in
> §D and the follow-up list in §G are kept current; §I logs what has closed
> since. Both of §G's original headline risks — the drawer overflow and the
> Storm Watch contrast — are now **fixed**.

**Method.** Six blind dimension sweeps (accessibility, responsive, product UX,
real-world states, React correctness, docs/portfolio) run as parallel
sub-audits over the source, each required to carry `file:line` evidence.
Findings were then re-verified by hand against current source before anything
was changed, and layout claims were **measured in Chromium against the
production build** at 320/360/390/430/760 px rather than reasoned about. Two
findings were disproved during that verification and are recorded in §H rather
than silently dropped. Every fix in this branch was re-measured or re-tested
after the change.

**A note on overlap.** This audit started from `1d5c699` (PR #155). While it
was in progress, `main` advanced 14 commits (PRs #152–#169) from a parallel
effort that landed equivalent fixes for six of the findings below. Those files
take main's implementation wholesale — it is the merged and reviewed one. Only
findings with no counterpart on main are claimed here. §D marks which is which.

---

## A. Current state summary

Aura is a genuinely strong portfolio project, and the bar it should be judged
against is not "is this a good weather app" — it clears that — but "does the
code hold the promises the docs make about it". Mostly it does. The strict
number contract (`toFiniteNumber` over `Number()`) holds at the value layer,
the layering rule is machine-enforced by `eslint-plugin-boundaries`, and the
test suite is real: 654 Node checks across 142 suites, 258 of them React render
tests, plus 34 Playwright specs and a Lighthouse budget gate in CI.

The defects this audit found cluster into one shape, and it is worth naming
because it is the interesting result:

> **Rules that exist, read correctly, and do nothing.**

A 44px touch floor declared before the width tier that overrides it. A
narrow-phone width ceiling defeated by a descendant selector's specificity. A
`prefers-reduced-motion` flag whose only effect was to make a button inert. A
`var()` pointing at a token the redesign deleted. A CSS comment that swallowed
the rule it documented. A retry button that could not retry. A signature
sentinel outside its own function's range. None of these fail loudly; all of
them read as correct in review. That is the class of bug a mature codebase
accumulates, and finding it required measuring rather than reading.

The second cluster is **self-reported numbers that were never re-measured** —
including two rows in the case study's metrics table that reported reductions
which never happened, in a repo whose entire brand is documentary honesty.

**Portfolio-ready?** Yes. **Production-quality?** Close, with the caveats in §G.
**Critical blockers remaining?** None; the one data-loss path is fixed here.

## B. Strengths (verified, not assumed)

- **The trust contract is architecture, not decoration.** `toFiniteNumber`
  rejects `null`/`""`/booleans/objects at the API boundary; missing readings
  render `—` with `role="img"` and `aria-label="No data available"`, so
  assistive tech hears the data state rather than the glyph. Negative tests
  pin it at unit, render and e2e level.
- **`?mock=missing` is a one-click failure demo.** A reviewer sees the entire
  missing-data contract in a single URL, and the route now provably issues zero
  provider requests.
- **Layered state honesty.** Forecast, AQI, NWS alerts and archive each carry
  their own status, so "unsupported region" and "service down" never collapse
  into one vague message. `SourceHealthPanel` correctly labels restored rows
  "Saved".
- **Real accessibility work, not a checklist.** Correct heading outline end to
  end, DOM order matching visual order in the bento, genuine accessible names
  on every icon-only control, an InfoDrawer that handles Escape and restores
  focus, and a native `input[type=range]` scrubber with `aria-valuetext`.
- **Performance is measured, not asserted.** Lighthouse 99/100/100/100 against
  budgets 85/95/90/90, gated in CI, with Leaflet and Supabase both kept off the
  critical path.
- **Machine-enforced boundaries.** `components → hooks → api/services →
  utils/domain`, with zero React imports in the lower layers.

## C. Weaknesses (what hurts most)

1. **A restored offline snapshot replayed expired severe-weather alerts as
   active** — the one surface where being wrong has physical-safety
   consequences, and the only panel with no freshness qualifier of its own.
2. **A cold-start race could destroy the cloud backup** while the UI reported
   "Backed up".
3. **Help drawers render off-screen on phones**, hidden by `overflow-x: hidden`.
4. **Declared touch floors and width ceilings that the cascade silently
   discarded** — the app measured worse than its own CSS claimed.
5. **The rain headline contradicted the threshold drawn on the same card.**
6. **Self-reported metrics that `wc -l` disproves in five seconds.**

## D. Findings

Twenty-eight findings survived verification. **★ = fixed in this branch.**
**◆ = fixed independently on `main` (PRs #152–#169) while this audit ran.**
**✔ = fixed after the audit, in the PR named** (see §I).

### 🔴 Critical

| # | Finding | Status |
|---|---|---|
| 1 | Restored cache replays **expired NWS severe alerts** as active — critical badge, "Until \<a past time\>" | ★ |
| 2 | **Cold-start auto-push races the restore-pull and overwrites the cloud backup**; if localStorage was cleared, it destroys the only copy | ★ |
| 3 | Rain Outlook headline calls a **22% chance "Rain likely"**, contradicting the 50% line on the same card | ★ |
| 4 | **InfoDrawer help panels render off-screen** on phones (up to 91.8px past the viewport at 320px) | ★ partial → ✔ #174 |
| 5 | Radar **Play button permanently inert** under `prefers-reduced-motion` | ◆ |
| 6 | Storm Watch severity headline **never reaches WCAG contrast**, worst at the highest risk | ✔ #173, #176 |
| 7 | Case study's metrics table claims **file-size reductions that never happened** | ★ |
| 8 | `?mock=missing` banner promised no provider calls while radar queried RainViewer/CARTO | ◆ |

### 🟡 Important

| # | Finding | Status |
|---|---|---|
| 9 | Choosing a city with the keyboard **drops focus to `<body>`** | ★ |
| 10 | Cold load **steals focus into `<main>`**, past the header, for every first-time visitor | ★ |
| 11 | Freshness pill's accessible name omits its state word; under 420px `display:none` left an aria-hidden **colour dot as the only carrier** of "saved"/"stale" | ★ (CSS) / ◆ (label) |
| 12 | StatusStack's **44px touch floor is dead code** — PWA and retry buttons render 36px on every phone | ★ |
| 13 | Severe-alert expiry printed in the **viewer's clock, not the location's** | ★ |
| 14 | Hero gust callout prints **mph to Celsius users** | ★ |
| 15 | `useLocalStorageState` rebuilds its `serialize` default each render → **a localStorage write on every render** | ★ |
| 16 | An unterminated comment in `App.css` **swallowed the forced-colors rule** for the dew-point comfort scale | ★ |
| 17 | Three lazy mounts had **no error boundary**; a failed chunk took down the whole dashboard | ◆ |
| 18 | "Try again" **could not recover a failed chunk** (React caches the rejection permanently) | ◆ |
| 19 | Three loading live regions announce the cold load; **nothing announces the end** | ◆ |
| 20 | Focus indicators below WCAG 1.4.11 on chart controls | ◆ |
| 21 | Hourly chart marks "now"/elapsed with **opacity and an `aria-hidden` tick only** | open |
| 22 | UV occupies **four hero slots**, three still advising sunscreen after dark | open |
| 23 | Dew point carries **two incompatible comfort vocabularies** on one page | open |
| 24 | Denied geolocation **discards the city being viewed** and jumps to the default | open |
| 25 | Global error screen **removes the header and search**, stranding the user | open |
| 26 | Hero reads `daily[0]` of a restored snapshot — can disagree with the Week Ahead panel below it | open |
| 27 | Radar legend links are 9px text / 11px tall; `HourlyCard.css` has **no coarse-pointer rules at all** | open |
| 28 | README quoted **three sync-panel button labels that do not exist** | ◆ |

### ⚪ Optional

Rain timeline bars 9.3px wide at 320px despite an aria-label inviting taps
(open); `DataTrustFooter` stamps a 48h-old snapshot with a clock-only time
(open); the unused `Stat` component and its dead `.stat` CSS, including a
dangling `--subcard-bg` (✔ — the token reference was repaired in #175 and the
component and its CSS deleted in #177).

## E. What was changed, and why it matters

| Area | Change | Why |
|---|---|---|
| **Severe alerts** | Restore path drops alerts past their own `expires`; reports the channel `unavailable` rather than asserting "no active alerts" when that empties a populated list. `AlertsCard` repeats the check. | A user opening Aura offline after a storm — exactly when connectivity fails — saw a two-day-old Tornado Warning presented as live. Live fetches can't hit this (`/alerts/active` only returns active alerts), so the guard belongs on restore. |
| **Cloud backup** | Signature ref seeds from the mount-time list; no auto-push arms until the initial restore settles; the account-creation path releases that gate immediately. | The seed was `""`, which `getSavedCitiesSignature` can never produce, so the "nothing changed" short-circuit was unreachable and every cold start armed a push that could beat the restore and overwrite the cloud row. |
| **Rain wording** | Headline and chips share one ladder; the modelled-amount-only case names the model instead of borrowing "likely". | The card contradicted itself in three places at once. |
| **Help drawers** | Component width overrides scoped above the 420px tier so InfoDrawer's ceiling applies. | Measured: radar panel at 320px went from 256px wide ending 91.8px past the viewport to 220px ending 55.8px past; 360px and 390px now fully inside. |
| **Touch targets** | StatusStack's coarse-pointer block moved after the width tiers, per the convention that file's own comment describes. | Measured 36px → 44px at 320/390/430/760px. |
| **Keyboard focus** | Keyboard city selection keeps focus in the combobox (pointer selection still blurs, so the mobile keyboard closes); cold load no longer moves focus into `<main>`. | Both left keyboard users unable to Tab to the header. |
| **Freshness pill** | The state word is visually hidden under 420px instead of `display:none`. | It was the only non-colour carrier of "saved"/"stale" on a phone. |
| **Units / clocks** | Gust callout routes through `formatWindSpeed`; alert expiry renders in the location's zone with a zone label. | Same class as the already-fixed pressure-trend and sun-arc clock bugs. |
| **Render cost** | `useLocalStorageState` defaults hoisted to module scope. | Removed a synchronous localStorage write on every App render. |
| **Forced colors** | Closed the comment that swallowed the dew-point comfort-scale WHCM rule; restored it. | In high-contrast mode the gradient track and its marker were both flattened away. |
| **Docs** | Case study's metrics table re-measured; README test counts, App.css line count and architecture tree corrected. | Two rows reported reductions that never happened, in the repo whose brand is honest documentation. |
| **Tests** | `+45` checks: chunk-retry recovery and its runaway-loop guard, alert expiry (including timezone), the signature sentinel, gust units, and the e2e provider-isolation guard extended to the tile and backend hosts it never watched. | The isolation test's blind spot is precisely why the radar leak survived. |

## F. Validation

All commands run from the repo root on the final tree.

| Check | Result |
|---|---|
| `npm run lint` | **pass** (0 problems) |
| `npm test` | **pass** — 654/654 across 142 suites |
| `npm run test:render` | **pass** — 258/258 across 76 suites |
| `npm run build` | **pass** |
| `npm run test:e2e -- --workers=1` | **32/34** — see below |
| `npm run test:lighthouse` | **pass** — perf 99, a11y 100, best-practices 100, SEO 100 (budgets 85/95/90/90) |

**The two e2e failures are environment-blocked, not regressions.**
`readme-screenshots.spec.js` desktop + mobile hang in `waitForRadar` on
`leaflet-tile-loaded`: this container's egress proxy refuses browser TLS to
CARTO's tile hosts, so basemap tiles never load. They are on the normal route,
which this branch does not touch, and they fail identically on unmodified
`main` here. The same two were recorded as blocked in the 2026-08-30 audit.

Two environment workarounds were needed and are **not** repo changes: the
pinned Playwright expects Chromium 1217 while the image ships 1194 (pointed at
the installed binary via a throwaway config), and `chrome-launcher` needed the
same path for Lighthouse.

## G. Remaining risks and follow-ups

*Current as of 2026-09-01. Items that have since closed are in §I.*

1. **`exposure.js` holds a third copy of the risk ramp.** `getAqiStatus` and
   the `UV_BANDS` table return hexes that restate `--risk-*` — the same defect
   #176 removed from both `meteorology.js` classifiers, and the last instance
   of it. It is the harder one: unlike those two, these hexes **are** read, so
   removing them changes rendering rather than deleting dead weight. Needs its
   own change, with before/after colour measurement.
2. **No automated coverage for the sync race.** The fix is verified by reading
   and by a sentinel test on `getSavedCitiesSignature`, but the hook itself has
   no test: it imports its service module directly, `node:test` in this version
   has no `mock.module`, and adding injection would be an architectural change
   beyond that scope. A follow-up should introduce a seam.
3. ~~**The render suite is flaky.**~~ **Withdrawn — this was already fixed, and
   the claim was wrong.** It belongs in §G's history rather than its open list
   because it was carried here on stale information and is worth the correction.

   The claim was that `WeatherDashboard supplemental chunk failure` fails ~2
   runs in 10 on clean `main`, citing a red `Quality Gates` run. The red run is
   real: `33a7ab7` (the #169 merge) failed on exactly that test's first
   subtest. But it **predates its own fix.** `33a7ab7` is an ancestor of
   `9da163b` (#163), which replaced the test's fixed four-turn drain with a
   loop that exits on the condition — the boundary having committed — precisely
   because a fixed count observed zero fallbacks whenever the box was busy.

   Re-measured on `main` at `2399e46`: **36 runs, zero failures** — 20 of the
   file alone, 10 of the full render suite, and 6 of the full suite under 2×
   CPU saturation, since the original failure mode was load-dependent and an
   idle box would prove nothing. The fix is present (`i < 200` with a condition
   break; the `i < 4` drain is gone) and 16 commits have landed green since.
4. **`README.md` and `docs/screenshots/dashboard-*.png`** remain stale in ways
   only CI can fix — the dashboard captures need live tile hosts. The
   `refresh-screenshots` workflow added on main is the right vehicle.
5. **Findings 21–27 are unfixed** and specified with file:line in §D; each is a
   real defect, and several (the hourly chart's `aria-hidden` "now" marker, the
   geolocation-denial city reset, the header disappearing on the error screen)
   are worth more than some of what was fixed here — they were left because
   they need product or design decisions rather than because they are minor.
   Of these, **24, 25 and 26 have a defensible correct behaviour** and need
   less judgment than the label suggests: do not discard the viewed city on a
   permission denial, keep navigation on the error screen, and read one source
   for both the hero and the Week Ahead panel. **21, 22, 23 and 27 are genuine
   design calls** and should wait on direction.
6. **Two e2e specs cannot be run in this container.** `readme-screenshots.spec.js`
   desktop + mobile hang on `leaflet-tile-loaded` because the egress proxy
   refuses browser TLS to CARTO's tile hosts. They pass in CI, so this is a
   local verification gap rather than a defect — but it means any change to the
   radar basemap is unverifiable here.

## H. Refuted during verification

Recording these because an audit that only reports hits is not measuring itself.

- **"Seed `wasInterruptedRef` to `false`" (proposed fix for finding 10) is
  wrong.** The effect runs during the loading renders and sets the ref to
  `true` before the transition, so the focus move would still fire. Fixed
  instead by tracking whether the dashboard had ever been shown.
- **"Rebuild the failed lazy inside the rejection handler" (proposed fix for
  finding 18) is actively harmful.** Implemented and probed: React re-renders a
  suspended subtree the moment its thenable settles, so it picks up the
  replacement itself and a permanently broken chunk refetches in a hot loop —
  measured past 40 attempts in milliseconds, with the error boundary never
  appearing. Recovery must stay manual. `main`'s implementation reached the
  same conclusion independently.
- **The dangling `--subcard-bg` has no user impact.** It sits in `.stat`, whose
  component (`Stat`) is exported but has zero consumers. Real finding, but dead
  code, not a visual bug — demoted to ⚪.

## I. Status log since the audit

Findings that closed after 2026-08-30, and what closed them. The audit body
above is left as written; this section is the only place statuses move.

| Date | Finding | Closed by |
|---|---|---|
| 2026-08-31 | **6** — Storm Watch severity headline never reaches WCAG contrast | #173 drove `.storm-level` from the audited `--severity-*` text tokens via `data-tone`; #176 then moved the risk meter's pips onto the same tone map. |
| 2026-08-31 | **4** — InfoDrawer help panels render off-screen on phones | #174 anchored the panel to its card (`position: absolute` against the nearest `.glass`, measured and set at open) instead of leaving it an in-flow right-aligned child that width caps could not contain. An e2e guard opens every drawer at three viewports and asserts containment in both the viewport and the card. |
| 2026-08-31 | ⚪ — unused `Stat` component, dead `.stat` CSS, dangling `--subcard-bg` | #175 repaired the token reference (and added `src/App.tokens.test.mjs`, which fails on any bare `var()` naming an undefined token, or any comment that has swallowed another); #177 then deleted the component and its CSS. |
| 2026-08-31 | §H's third entry is now moot | The `Stat` component it described no longer exists. |

**Not a finding from this audit, but closed alongside them:** `classifyStormRisk`
and `classifyComfort` in `src/domain/meteorology.js` each returned a hex per
level that was a drifted partial copy of the `--risk-*` ramp. #176 removed
colour from both, leaving `--risk-*` as the single source of truth for the two,
and pins the *absence* of a colour key so a hex cannot creep back. The third
copy, in `exposure.js`, is §G item 1.
