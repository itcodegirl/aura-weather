# Aura Weather — Deep Product, UI/UX, Frontend & Portfolio Audit

**Date:** 2026-08-30
**Branch:** `claude/aura-weather-audit-ia9chc` (cut from `main`)
**Baseline commit:** `81e2934` ("Merge pull request #145") — identical to `origin/main` (0 ahead / 0 behind at audit start)
**Node:** v22.22.2 · **npm:** 10.9.7 · **package version:** 1.1.0
**Production:** https://aura-weather-platform.netlify.app/

**Method.** Five parallel deep source reviews (hooks/services, API/PWA, components, CSS/design-system, docs/tests/CI), each producing file:line evidence that was then independently spot-verified against current source; full local quality-gate run (`lint`, `test`, `test:render`, `build`, `test:e2e -- --workers=1`, `test:lighthouse`); live browser inspection of the production build at 320/390/430/768/1024/1440 px in normal, missing-data (`?mock=missing`), and total-network-failure states; empirical provider-API probes (NWS `alerts/active` for five non-US points); HTTP-level verification of the production deploy; verification pass over every open item from the 2026-06-26, 2026-07-03, 2026-07-27, and 2026-08-16 audits. Several agent-reported findings were **refuted** during verification and are recorded as such (§U) rather than silently dropped.

---

## A. Executive verdict

**Aura is a strong portfolio project — engineering-first, honest by architecture, and remediated to a degree almost never seen in solo work — but this audit found a cluster of residual defects that sit, uncomfortably, inside the exact story the project tells about itself.** The strict-number contract holds everywhere at the value layer (five previous audits' worth of coercion bugs stay fixed, and no new fake-zero path was found). What leaks now is one level up: **interpretive language and status labels that outrun their data**. The `?mock=missing` demo banner claims "Live providers are not queried" while the radar stack queries RainViewer and CARTO on that very route; a restored offline snapshot correctly labels the forecast "Saved" while the same panel labels its equally-stale AQI and alerts rows "Live"; the pressure-trend interpretation ("Storm possible" / "Clearing") is computed against the viewer's clock rather than the location's, so it reads the wrong hour for any remote saved city; and the hero can display "Moderate UV today" and "UV High" simultaneously for the same reading.

- **Portfolio-ready?** Yes — with the caveat that the README currently contradicts itself and sends reviewers to look for UI text that no longer exists, which undercuts a repo whose brand is "the docs are honest."
- **Product-quality?** Very close. Core flows, states, responsiveness (0 px overflow at all six audited widths), performance (Lighthouse 99/100/100/100 against budgets 85/95/90/90), and the trust architecture are genuinely production-grade. The defect list below is real but narrow.
- **Biggest remaining weakness:** trust-adjacent *language/label* correctness (findings T-01…T-07) and documentation drift (D-01…D-03) — both fixable without any design judgment.
- **Strongest differentiator:** the data-trust contract as a four-layer architecture with negative tests, a one-click failure demo, machine-enforced boundaries, and a case study that documents its own past failures.
- **Critical blockers:** none. 🔴 count is zero.

**Overall rating: STRONG PORTFOLIO PROJECT** (rationale in §W; what separates it from "interview-standout" is exactly the Phase 1 + Phase 6 lists — all mechanical, none requiring design decisions).

---

## B. Audit baseline

| Item | Value |
|---|---|
| Date | 2026-08-30 |
| Branch | `claude/aura-weather-audit-ia9chc` |
| Commit | `81e2934` |
| vs `origin/main` | 0 ahead / 0 behind (fresh) |
| Node / npm | v22.22.2 / 10.9.7 |
| Package version | 1.1.0 |
| Production URL | https://aura-weather-platform.netlify.app/ |
| Production deploy state | **Verified current at HTTP level**: prod `index.html` references the same content-hashed CSS (`index-DB1mffku.css`) and vendor chunks (`react-vendor-Bi-Qm108.js`, `lucide-JkSvSA4S.js`, `numbers-PeaDOH0i.js`, `temperature-B97QvJg2.js`) as a local build of `81e2934`; the served bundle contains the current header value line; `sw.js` is build-stamped (`aura-weather-5a66c59bb641`) |
| Live production **rendering** | **PARTIALLY BLOCKED** — this container's egress proxy resets Chromium's TLS tunnels to all external hosts (curl succeeds; browser cannot), so pixel-level production rendering could not be captured. All rendering evidence below comes from the **local production build** (byte-identical CSS, near-identical JS) served via `vite preview`, which the HTTP comparison above ties to the deploy. |
| Checks run | lint ✓ · unit 575/575 ✓ · render 208/208 ✓ · build ✓ · e2e 30/34 (4 = radar-tile-host captures, environment-blocked; see §T) · Lighthouse budgets ✓ (99/100/100/100) · `npm audit` 0 |
| Blocked | Production pixel rendering (proxy); 4 screenshot-capture e2e specs that wait on live map-tile hosts (same class of block prior audits recorded; those specs pass in CI) |

---

## C. Current architecture map

```text
main.jsx ── boot: forecast preload (promise handoff) → <AppErrorBoundary> → App
App.jsx ── useWeatherDashboardViewModel (one seam: location + weather + prefs + mock switch)
   │            │
   │            ├─ useLocation ──── locationHelpers / savedCities (domain)
   │            ├─ useWeather ───── useWeatherData ── api/openMeteo ── transforms ── types
   │            │                    ├─ useClimateComparison ── archive API
   │            │                    └─ services/weatherSnapshotCache (offline restore)
   │            ├─ useDisplayPreferences (unit — display-only; never touches fetch params)
   │            └─ useUrlLocationSync / useDocumentTitle / useThemeColor
   ├─ AppShell → AppHeader (CitySearch · SavedCitiesStrip · DisplaySettings · SyncAccountPanel*)
   ├─ StatusStack (onboarding · offline/cached · SW update · install prompt)
   └─ WeatherDashboard
        ├─ AlertsCard (NWS; ready/unsupported/unavailable trichotomy)
        ├─ HeroCard ← buildHeroData / buildAtmosphereReading (pure builders)
        ├─ lazy: HourlyCard          [PanelErrorBoundary ✓]
        ├─ lazy: RadarPanel (Leaflet)[PanelErrorBoundary ✓, longest defer]
        ├─ lazy: SupplementalWeatherPanels  [❌ NO error boundary — R-01]
        │         └─ Nowcast · RainCard · StormWatch · ForecastCard · AtmosphereBento
        │            (five PanelErrorBoundaries live INSIDE this chunk)
        ├─ lazy: RainAlertsPanel*    [PanelErrorBoundary ✓; only Supabase entry point]
        └─ <details>: SourceHealthPanel · DataTrustFooter
* Supabase optional; client never downloaded without a stored session (one gap: §G P-03)
```

Dependency direction `components → hooks → api/services → utils/domain` is **machine-enforced** via `eslint-plugin-boundaries` (`eslint.config.js:56-74`) and holds — grep confirms zero React imports in `services`/`api`/`utils`/`domain`. Two small violations exist *inside* the hooks layer: `locationHelpers.js:2-7` and `savedLocationsSyncHelpers.js:3` (pure helper modules) import a string utility and constants from `useLocation.js`, which imports React — dragging React into the module graph of "pure" helpers (A-02).

Transport unit is fully decoupled from display unit: the wire format is pinned (`useWeatherData.js:44-48`), unit never reaches the fetch dependency array, and the e2e test `weather-smoke.spec.js:315` counts requests across a toggle to prove no refetch. Verified end to end.

---

## D. Previous-audit verification (inheritance table)

Every meaningful prior finding, verified against `81e2934`. "Verified fixed" means re-checked in current source or behavior this audit, not inherited from a prior audit's claim.

| Previous finding (origin) | Previous status | Current status | Evidence | Reopened? |
|---|---|---|---|---|
| Hero drops computed daily guidance (UX#1, 06-26) | Fixed (08-16) | **VERIFIED FIXED** | `HeroCard.jsx` renders `dailyGuidance` list; guidance builders live in `buildHeroData.js:197-225` | No |
| Six precip surfaces / breadth vs sharpness (UX#2/E2) | Open-by-decision | **INTENTIONAL DECISION** | `docs/case-study.md` "Why six surfaces talk about rain" — six questions × six horizons table + recorded reversal trigger | No |
| Three risk vocabularies (UX#3) | Fixed | **VERIFIED FIXED** | shared `severity-badge--{tone}` scale: `StormWatch.jsx:30-36`, `NowcastCard.jsx`, `RainCard.jsx:322`; 50% "rain likely" threshold app-wide | No |
| Unconditional "High confidence" pill (UX#9) | Fixed | **VERIFIED FIXED** | four-state pill `HeroCard.jsx:193-233`; headline-absence outranks freshness | No |
| Empty Moon tile (UX#7) | Fixed | **VERIFIED FIXED** | no moon tile in `AtmosphereBento.jsx` | No |
| "Start" chip ambiguity (UX#5) | Fixed | **VERIFIED FIXED** | "Set startup" + explained badge, `SavedCitiesStrip.jsx` | No |
| Reverse-geocode silent fallback (UX#8) | Fixed | **VERIFIED FIXED** | `useLocation.js:557-563` distinguishes named vs unnamed notice | No |
| F1 hero chips double-convert units (07-03) | Fixed | **VERIFIED FIXED** | chips classify against raw °F/mph, `buildHeroData.js` | No |
| F2 rain totals use device midnight | Fixed | **VERIFIED FIXED** | `useRainAnalysis.js` derives day start via `getZonedNow` | No |
| F4 getters write to localStorage | Fixed | **VERIFIED FIXED** | `useLocation.js:172-176` pure reads with blast-radius comment | No |
| F5 refresh listeners churn per city | Fixed | **VERIFIED FIXED** | effect depends only on `[backgroundRefreshEnabled, enabled]`, `useWeatherData.js:592-607` | No |
| F7 ~24 tab stops per chart | Fixed | **VERIFIED FIXED** | roving tabindex in HourlyCard + RainCard (`RainCard.jsx:287-303`) | No |
| F14/F15 edge-function fail-open / threshold 0 | Fixed | **VERIFIED FIXED** | `check-rain-alerts/index.ts` fails closed; `Number.isFinite` threshold | No |
| E1 jsonblob sync privacy | Resolved | **VERIFIED FIXED** | Supabase-JWT sync; `0003_saved_cities.sql` documents the old vulnerability | No |
| N1 `sameLocation` raw `Number()` (07-27) | Fixed (08-16) | **VERIFIED FIXED** | `rainAlertHelpers.js:12-21` `toFiniteNumber`, null coords match nothing | No |
| N2 lighthouse `ws` advisories | Fixed | **VERIFIED FIXED** | `npm audit` → 0 this run; lighthouse 13.4.1 | No |
| N3 CHANGELOG/version stagnant | Fixed | **VERIFIED FIXED** | 1.1.0 cut 2026-08-17; CHANGELOG current | No |
| N4 token drift (202 raw hex) | Closed by decision | **INTENTIONAL DECISION — with residue** | `fe9ed35` documents the stopping point (57 genuinely-distinct values kept raw, reasoning recorded). **However**, the pre-Glacier cyan family (28 sites) and two broken `var()` refs fall *outside* that decision — see DS-01/DS-02 | Partially |
| N5 dependency currency | Fixed | **VERIFIED FIXED** | Vite 8.1.5, ESLint 10, plugin-react 6, jsdom 30 | No |
| N6 rain-alerts abort discipline | Fixed | **VERIFIED FIXED** | `createAlertRequestTracker`, `rainAlertHelpers.js:36-63` | No |
| Brand value one-liner (UX 4.1) | Shipped (08-17) | **VERIFIED FIXED** in app; **README/screenshots never caught up** → D-02/D-03 | Partially |
| Trust fabrications: "Clear" wrapper, invented gusts, "0% rain" (08-16 pass) | Fixed | **VERIFIED FIXED** | `ForecastCard.jsx:39-42` (`toNumberOrNaN`, no fallback arg); `AtmosphereBento.jsx:245-248`; `HourlyCard.jsx:361-374` | No |
| Storm Watch stale CAPE / hero stale imminent-rain (index-0 reads) | Fixed | **VERIFIED FIXED** | `StormWatch.jsx:130-144` and `buildAtmosphereReading.js:48-53` anchor via `findWindowStartIndex` | No |
| SW update could never ship | Fixed | **VERIFIED FIXED** | build-stamped `CACHE_VERSION` verified in local `dist/sw.js` **and** production `sw.js` | No |
| a11y: forecast-row aria-label swallowed row data | Fixed | **VERIFIED FIXED** | `ForecastCard.jsx:309-318` name carries all readings, with rationale comment | No |
| a11y: trust-pill live-region loop / Escape blur / hidden chart values / inverted switch names | Fixed | **VERIFIED FIXED** | `HeroCard.jsx:438-446`; `useCitySearch.js:234-238`; chart aria; — but see A11Y-02: the *selection* path still blurs | Partially |
| Visual-regression removal (08-20) | Decision | **INTENTIONAL DECISION** | removal + cost recorded in CHANGELOG and case study; replacement layout guards mutation-tested | No |

**Nothing previously marked fixed has regressed.** The two "Partially" rows are not regressions of the fix itself: the value line shipped but the docs/screenshots lag it (D-02/D-03), and the Escape-blur fix didn't extend to the selection path (A11Y-02).

---

## E. Strengths (verified, not aspirational)

1. **The strict-number layer genuinely holds.** A full grep for `Number(` / `parseInt` / `parseFloat` / `|| 0` / `?? 0` across `src/` finds every provider-touching site routed through `toFiniteNumber` (`utils/numbers.js:31-49`, which also rejects objects/arrays — the coercion people forget). The residual `?? 0`s are provably benign (a sort comparator, a config default, one unreachable defensive branch at `buildAtmosphereReading.js:117`). The one raw `Number()` in components is a range-input's own value (`RadarTimeline.jsx:108`) — user-controlled, not provider data.
2. **Unit toggle provably refetches nothing.** Wire unit pinned at `useWeatherData.js:44-48`; display conversion downstream; `weather-smoke.spec.js:315` asserts request counts across the toggle.
3. **Time anchoring is now a shared discipline.** `findWindowStartIndex` + `getZonedNow` (with the clearest naive-timestamp explanation I've seen in a codebase, `dates.js:58-116`) anchor HourlyCard, StormWatch, nowcast, rain analysis, and the hero's imminent-rain scan. The `past_hours=48` regression class is closed and regression-tested (alarming CAPE parked in past slots must not reach the DOM).
4. **Request lifecycle is disciplined.** Every network-owning hook pairs an `AbortController` with a monotonic request-id and mounted guard; the stale-overwrite invariant in `useWeatherData` actually holds (every `setWeather` writer bumps the id first). Same-city refresh keeps data visible; city switch blanks it so Tokyo's name never sits above Chicago's numbers (`useWeatherData.js:359-367`).
5. **The PWA update path is real and verified in production.** Build-stamped `CACHE_VERSION` (vite plugin with honest post-mortem, `vite.config.js:7-24`) confirmed in the deployed `sw.js`; no `skipWaiting` without consent; install-time precache walks the JS import graph transitively so lazy chunks work offline; cross-origin provider requests are deliberately never SW-cached, so the SW cannot serve stale weather behind fresh pills.
6. **Performance discipline with receipts.** Initial route ≈118 KB gzip (app 38.6 + react-vendor 57.3 + lucide 7.1 + CSS 15.1); radar (165 KB) and Supabase (201 KB) both verified absent from `index.html` module-preloads; `hasStoredSession()` answers "no alert rules" from localStorage without downloading the client; Lighthouse 99/100/100/100 against enforced budgets of 85/95/90/90.
7. **Accessibility depth beyond axe:** correct ARIA 1.2 combobox with `aria-activedescendant`; roving tabindex on both charts; RainCard's full sr-only 24-hour enumeration via `aria-describedby` (`RainCard.jsx:446,484`); `InfoDrawer` focus management (move-in, Escape-restore, outside-pointer dismissal); *reasoned refusal* to make the trust pill a live region (`HeroCard.jsx:438-446`); axe in CI on both `/` and `?mock=missing` at WCAG 2.1+2.2 AA.
8. **Composited-contrast engineering.** `--text-muted`/`--text-dim` alphas derived from the worst-case gradient composite with the resulting ratios written down (`App.css:6-14`) — independently re-computed this audit and correct *for the surface they assume* (see DS-03 for where nesting defeats it). `--bg-well` flipped additive→subtractive specifically for AA, documented.
9. **Honest degraded states, live-verified.** With every external host aborted, the app renders a clear full-failure screen naming the provider; with providers mocked missing, all six viewports render the complete honest-unavailable dashboard with **0 px horizontal overflow** and zero suspicious strings (no `NaN`, no dangling units, no `0%`-from-missing). Radar failure inside the demo says "RainViewer didn't respond. Your forecast above is unaffected."
10. **Self-documenting judgment.** The six-rain-surfaces decision table with its reversal trigger; the visual-regression removal recorded *with its cost* ("nothing now catches an unintended layout shift"); the case study leading with the contract's failures rather than its successes; `getSessionUser` vs `ensureSession` split motivated by a named real incident.

---

## F. Findings summary

```text
🔴 Critical: 0
🟡 Important: 18
⚪ Optional: 14
Blocked: 2 (production pixel rendering; 4 tile-host capture specs — CI covers both)
Design decisions verified & respected: 4 (six rain surfaces; visual-regression removal;
   tokenization stopping point fe9ed35; dark-only theme)
Agent findings refuted during verification: 3 (§U)
```

---

## F1. Executive finding table

| ID | Priority | Category | Finding | Evidence | User impact | Portfolio impact | Recommended action |
|---|---|---|---|---|---|---|---|
| T-01 | 🟡 | Data Trust | `?mock=missing` banner claims "Live providers are not queried"; radar queries RainViewer/CARTO on that route | `missingData.js:103` vs `useRadarFrames.js:124-134`; reproduced | Demo's headline claim disproved by its own network tab | High — the route reviewers are sent to | Gate radar/alerts panels on the mock; widen e2e host list |
| T-02 | 🟡 | Data Trust | Restored snapshot labels AQI/alerts "Live" beside forecast "Saved" | `useWeatherData.js:125-138`; `SourceHealthPanel.jsx:59-110` | Stale supplemental data masquerades as fresh | High — provenance showcase panel | Downgrade supplemental statuses in `buildCachedTrustMeta` |
| T-03 | 🟡 | Data Trust | Pressure trend computed on viewer's clock; "6h" delta is 6-samples | `meteorology.js:48,70,85` | Wrong "Storm possible/Clearing" for remote cities | Med-high | Thread timezone; timestamp-based window |
| T-04 | 🟡 | Data Trust | Sun-arc bead mixes device epoch with naive rise/set | `AtmosphereBento.jsx:299-311` | Wrong daylight position for remote cities | Medium | Reuse hero's zoned reframing |
| T-05 | 🟡 | Data Trust/UX | Hero says "Moderate UV" and "UV High" simultaneously (5 threshold definitions) | `buildAtmosphereReading.js:21-22` vs `buildHeroData.js:240-244` | Contradictory guidance on one card | Medium | Single `classifyUv` in domain |
| T-06 | 🟡 | Data Trust | "Dry window / Dry 2h" badges from all-null probabilities; "stays below N%" copy | `analyzeNowcast.js:140-152`; `NowcastCard.jsx:120-137` | Scannable layer overstates certainty | Medium | Qualified badge when probability missing |
| T-07 | 🟡 | Data Trust | "Observed today" labels model data; running total counts missing as 0; 48h==24h silently | `RainCard.jsx:133-142,389`; `useRainAnalysis.js:140` | Provenance/completeness drift on totals | Medium | Relabel + qualify totals |
| R-01 | 🟡 | Resilience | Five-panel supplemental chunk has no error boundary — failure crashes whole app | `WeatherDashboard.jsx:250-278` | One chunk failure loses live dashboard | Medium | Wrap in PanelErrorBoundary |
| R-02 | 🟡 | Resilience | Boundary "Try again" cannot recover a failed chunk (React 19 caches rejection) | `PanelErrorBoundary.jsx:32-82`; `lazyPanels.js:14-18` | Recovery affordance no-ops | Medium | Retryable lazy factory |
| R-03 | 🟡 | Resilience/UX | Climate toggle-off leaves comparison rendered + "Live" | `useClimateComparison.js:29-49` | Disabled feature stays on screen | Low-med | Reset on disable transition |
| A11Y-01 | 🟡 | Accessibility | Chart focus rings 2.86:1; 1.04–1.33:1 inside green bars | `HourlyCard.css:86,209`; `RainCard.css:387` | Keyboard position lost on rain-likely hours | Medium | Inherit global white ring |
| A11Y-02 | 🟡 | Accessibility | City selection blurs input → focus to `<body>` | `useCitySearch.js:224` | Every keyboard search ends lost | Medium | Keep focus (match Escape fix) |
| A11Y-03 | 🟡 | Accessibility | Update pill's aria-label omits "saved/stale" state word | `GlobalUpdateIndicator.jsx:135` | AT users lose the trust-relevant word | Medium | Fold state into name |
| A11Y-04 | 🟡 | Accessibility | 5 staggered loading live-regions announce noise each load | `CardFallback.jsx:5-15`; `WeatherDashboard.jsx:66-85` | SR queue of transient noise | Low-med | Drop role=status from skeletons |
| DS-01 | 🟡 | Design system | Pre-Glacier cyan family at ~28 sites incl. focus/refresh vocabulary | `WeatherDashboard.css:156-183`; `RainCard.css:55-97`; `HeroCard.css:518` | Two competing blues | Medium | Mechanical token substitution |
| DS-02 | 🟡 | Design system | 2 broken `var()` refs; unterminated comment ate a forced-colors rule | `HeroCard.css:505`; `RadarPanel.css:213,435`; `App.css:791-795` | Silent styling failures | Low-med | Repair; add undefined-var check |
| DS-03 | 🟡 | Design/A11y | Nested tile surfaces + raw inks defeat the AA floor on bright gradients; sub-11px text | `AtmosphereBento.css:42`×`WeatherDashboard.css:119`; `HeroCard.css:688-805` | 3.7–4.2:1 muted text outdoors | Medium | Apply the spec's own nesting/token rules |
| DS-04 | 🟡 | Design system | Hero carries a second warm-cream skin overriding 12 selectors by source order | `HeroCard.css:688-805` | Fragile, conflicting design source | Medium | Collapse to one declaration set |
| P-01 | 🟡 | PWA | SPA catch-all + status-only SW guards can cache HTML as JS assets after deploy | `_redirects:5`; `sw.js:83-119` | Persistent broken module graph edge | Low-med | Content-type guard before caching |
| D-01 | 🟡 | Documentation | README self-contradicts (890 vs ~500), cites removed UI text, stale counts, missing stack entries | `README.md:282-423` | Reviewers verify and find drift | High | Single truth-up pass |
| D-02 | 🟡 | Documentation | All committed screenshots predate the current header by 5+ weeks; desktop shows blank radar | `docs/screenshots/*` vs `7749ce1` | Front-page images show a retired UI | High | Regenerate via CI |
| TEST-01 | 🟡 | Testing | 8 of "34 Playwright checks" are capture jobs; radar/SW-update/deep-link untested | spec headers; suite inventory | Real behavioral count is 26 | Medium | Report split; add 3 specs |
| UX-01 | 🟡 | Data Trust/UX | Radar can't say "no coverage"; missing frame renders as dry | `rainviewer.js:47-64`; `RadarMap.jsx:136-140` | "No radar" reads as "no rain" | Medium | Coverage caption; drop unbuildable frames |
| UX-02 | 🟡 | UX | Hero rain amount hardcoded to inches for °C users | `buildHeroData.js:132` | Mixed units on one page | Low-med | Thread display unit |
| O-01…O-14 | ⚪ | various | 14 verified lower-priority items | §G Optional | — | — | Phases 4–7 |

## G. Detailed findings

Severity legend per §37 of the audit charter. Categories: T = data trust, R = resilience, A11Y = accessibility, DS = design system, P = performance, D = documentation, TEST = testing, UX = product UX.

---

### 🟡 T-01 — The `?mock=missing` banner claims "Live providers are not queried," and the radar stack queries them
**Category:** Data Trust · **Status:** CONFIRMED
**Evidence:** Banner copy `src/mocks/missingData.js:103` — *"Portfolio demo: showing the missing-data trust contract. Live providers are not queried."* The mock disables `useWeatherData` (`useWeatherDashboardViewModel.js:61`) — but `location` is truthy, so `WeatherDashboard.jsx:72` mounts `RadarPanel`, whose `useRadarFrames()` fetches `https://api.rainviewer.com/public/weather-maps.json` on mount **and every 5 minutes** (`useRadarFrames.js:124-134`), plus CARTO basemap tiles and RainViewer tile PNGs. Reproduced this audit: on the production build at `?mock=missing` with external hosts instrumented, the radar panel attempted RainViewer (its failure state rendered when the request was blocked). If Supabase env is configured and a session exists, `RainAlertsPanel` → `listRules()` can also fire. The e2e guard (`weather-smoke.spec.js:558-581`) passes because it monitors **only the four Open-Meteo/NWS hosts** — the blanket claim in the banner is broader than what the test asserts.
**User impact:** Anyone who opens DevTools on the portfolio demo — the audience this route exists for — sees the app's own network tab contradict its on-screen claim. For a project whose thesis is honest self-description, this is the worst possible place to be wrong.
**Portfolio impact:** High — reviewers are explicitly invited to this route by the README.
**Recommended resolution:** Either (a) gate `showRadarPanel` (and `RainAlertsPanel`) on `isMissingMock`, rendering the radar card's honest "not queried in demo" state, or (b) soften the banner to name the forecast providers specifically. (a) is truer to the demo's purpose. Extend the e2e host list to rainviewer/cartocdn/bigdatacloud either way, so the claim and the test coincide.
**Risk of change:** Low. **Validation:** e2e `?mock=missing` spec with the extended host list; manual network-tab check.

### 🟡 T-02 — Restored offline snapshot labels AQI and alerts "Live" while labeling the forecast "Saved"
**Category:** Data Trust · **Status:** CONFIRMED (re-verified in source this audit)
**Evidence:** `buildCachedTrustMeta` (`useWeatherData.js:125-138`) spreads the snapshot's stored `trustMeta` and overrides **only** the three forecast fields. A snapshot written after a successful supplemental merge carries `aqiStatus:"ready"`, `aqiFetchedAt:<old>`, `alertsStatus:"ready"`. `SourceHealthPanel.jsx:59-69` renders any truthy `aqiFetchedAt` as status `ready`, label **"Live"**; `:98-110` renders `alertsStatus==="ready"` as **"Live"**. On the 48-hour degraded restore path the panel shows Forecast "Saved" beside Air Quality "Live · Updated 41h ago" and Alerts "Live" — from the same restored blob.
**User impact:** Cached supplemental data masquerades as fresh — the precise failure mode the trust-pill work exists to prevent, in the panel whose job is provenance. (Mitigation: the age string is honest; the *label* is not.)
**Portfolio impact:** High — this panel is the project's provenance showcase.
**Recommended resolution:** In `buildCachedTrustMeta`, downgrade `aqiStatus`/`alertsStatus` to a `cached`-equivalent (or null their `*FetchedAt` and add `aqiStatus:"cached"` handling in `SourceHealthPanel` mirroring the forecast row's "Saved").
**Risk:** Low. **Validation:** unit test on `buildCachedTrustMeta`; render test asserting the restored path never yields label "Live" for supplemental rows.

### 🟡 T-03 — Pressure trend is computed against the viewer's clock, not the location's
**Category:** Data Trust / Correctness · **Status:** CONFIRMED
**Evidence:** `calculatePressureTrend` (`domain/meteorology.js:48,70`) uses `const now = new Date()` and compares it against forecast timestamps that are naive location-local strings parsed in the device zone — the exact hazard `utils/dates.js:58-116` documents and every other consumer avoids via `getZonedNow`. The function takes no `timeZone` parameter. Viewing a saved city hours away shifts the "current" pressure sample by the UTC offset (up to ~14 h), corrupting the 6-hour delta that drives "Storm possible"/"Clearing"/"Stable" in the Atmosphere bento **and** the Storm Watch why-line drivers ("falling pressure", `StormWatch.jsx:83-94`). Secondary defect in the same function: nulls are filtered *before* indexing, so "6 hours ago" is actually "6 valid samples ago" (`meteorology.js:52-58,85-88`) — gaps silently stretch the labeled window.
**User impact:** Confidently-wrong storm-direction language for remote cities — same class as the F1/F2 unit/timezone bugs the July audit rated High.
**Portfolio impact:** Medium-high; it contradicts the documented time-anchoring discipline.
**Recommended resolution:** Thread `timeZone` into `calculatePressureTrend`, anchor with `getZonedNow` (and ideally `findWindowStartIndex`); walk back by timestamps, not indices, for the 6-hour sample; return "Not enough data" when the real 6-hour-ago sample is absent.
**Risk:** Low-medium (domain function, well-tested seam). **Validation:** unit tests with a remote-timezone fixture and a gapped series; existing `meteorology.test.mjs` extended.

### 🟡 T-04 — Sun-arc bead position mixes device epoch with location-naive sunrise/sunset
**Category:** Data Trust / Correctness · **Status:** CONFIRMED
**Evidence:** `AtmosphereBento.jsx:299-311` computes arc progress as `(nowMs − riseDate) / (setDate − riseDate)` where `nowMs` is the device epoch and rise/set are naive strings parsed device-locally. `buildHeroData.js:520-527` performs the correct reframing for the identical inputs two modules away. Viewing a remote city pins the bead to an arc end while the printed times (which round-trip correctly) look right — the worst kind of wrong.
**User impact:** Wrong daylight-progress visual for remote cities.
**Recommended resolution:** Reuse the hero's zoned-now reframing for the progress fraction.
**Risk:** Low. **Validation:** unit test on the extracted fraction with a cross-zone fixture.

### 🟡 T-05 — The hero contradicts itself on UV: "Moderate UV today" beside "UV High" for the same value
**Category:** Data Trust / UX · **Status:** CONFIRMED (re-verified: thresholds read directly this audit)
**Evidence:** `buildAtmosphereReading.js:21-22` defines `HIGH_UV=8, MODERATE_UV=6` and emits *"Moderate UV today — easy on the sun exposure."* for 6≤UV<8. Every other consumer calls 6–8 **High**: `buildHeroData.js:241` (`UV_HIGH_MIN=6` → panel level "High", line "High UV today — sun protection is worth it midday."), chips (`uvIndex>=6` → "UV high"), `exposure.js` scale. At UV 6.5 one card simultaneously renders the reading line "Moderate UV today", a chip "UV high", and a UV panel "High". The comment at `buildHeroData.js:236-239` claims the thresholds agree; it is wrong. Root cause: **five separate UV threshold definitions** (three inside `buildHeroData.js`, one in `buildAtmosphereReading.js`, one in `exposure.js`).
**User impact:** The most guidance-relevant reading gives two verdicts at once; the *headline* line is the one that de-escalates.
**Recommended resolution:** Single UV threshold module in `domain/exposure.js`; all five sites consume it. Align `buildAtmosphereReading`'s wording to the shared scale ("High UV" at 6–8, "Very high" at 8+).
**Risk:** Low. **Validation:** unit test asserting reading-line band == panel band for boundary values 5.9/6.0/7.9/8.0.

### 🟡 T-06 — Nowcast's scannable layer asserts "Dry window / Dry 2h" when rain probability is entirely missing
**Category:** Data Trust · **Status:** CONFIRMED
**Evidence:** `analyzeNowcast.js:140-152` reaches the no-rain branch when every probability is `null` but weather codes are dry, returning `hasRain:false` with an honest *details* sentence ("Rain chance is unavailable, but no wet weather code…"). `NowcastCard.jsx:120-121,136-137` renders badge **"Dry window"** and chip **"Dry 2h"** — certainty at the scannable layer that the fine print withdraws. Peak correctly shows "—". Related copy defect: `analyzeNowcast.js:151` emits *"Peak rain chance stays below N%"* where N **is** the computed peak (it reaches N, not stays below it).
**User impact:** A glance-reader — the persona the card is designed for — receives an unqualified dry verdict from missing data. The weather-code evidence makes it a *reasonable inference*, but the badge language claims more than the inputs support.
**Recommended resolution:** When `peakProbability` is null, badge/chip language should carry the qualifier (e.g. "Likely dry" / tone `partial`), keeping the severity-badge vocabulary; fix the "stays below" copy to "peaks near N%".
**Risk:** Low (copy + one branch). **Validation:** render test for the null-probability-dry-codes fixture asserting qualified language.

### 🟡 T-07 — RainCard labels model output "Observed", and its running total counts missing hours as zero
**Category:** Data Trust · **Status:** CONFIRMED
**Evidence:** (a) The 12/24/48h sums and "Observed today" (`RainCard.jsx:389`, "Recent totals" `:412`) are computed from `hourly.rainAmount` past slots of the *forecast* endpoint (`past_hours=48`, `openMeteo.js:324`) — model/analysis values, not gauge observations; `AtmosphereBento.jsx:483-490`'s footnote makes exactly this distinction and RainCard doesn't. (b) `RainCard.jsx:133-142` folds `null` slots into the cumulative "total so far" as 0 (`entryAmount === null ? 0 : …`) — the separate `missingSlots` note (`:479-483`) does not qualify the headline number. (c) When fewer than 48 past hours exist, the 48h pill silently equals the 24h pill (`useRainAnalysis.js:140` clamp) with no qualifier.
**User impact:** Trust-language drift on the densest precipitation surface: "observed" implies measurement; a total computed over gaps reads as complete.
**Recommended resolution:** Rename "Observed today" → "Modeled so far today" (or footnote it like the bento); render the cumulative total with a "+" or "at least" qualifier when `missingSlots > 0`; suppress or annotate the 48h pill when the window is short.
**Risk:** Low. **Validation:** render tests for gapped/short-window fixtures.

### 🟡 R-01 — The five-panel supplemental chunk is the one lazy boundary without an error boundary; its failure takes down the whole app
**Category:** Resilience/Architecture · **Status:** CONFIRMED (re-verified in `WeatherDashboard.jsx` this audit)
**Evidence:** `WeatherDashboard.jsx:250-278` — `<Suspense>` around lazy `SupplementalWeatherPanels` with **no** `PanelErrorBoundary`, unlike hourly (:177), radar (:218), and rain-alerts (:279). The five per-panel boundaries live *inside* that chunk (`SupplementalWeatherPanels.jsx`), so they fail to load along with the panels they protect. A chunk-fetch failure (deploy boundary, flaky network mid-session) propagates to `AppErrorBoundary` — the entire dashboard, hero included, is replaced by "Something went wrong" even though the forecast data is already on screen.
**User impact:** Violates the app's own documented resilience story ("a lazy-chunk failure degrades to '{panel} is unavailable'") for the *largest* set of panels.
**Recommended resolution:** Wrap the Suspense in a `PanelErrorBoundary` (label "Extended weather details", spanning class matching `bento-supplemental-loading`). Consider the same for the lazy `SourceHealthPanel` and `SyncAccountPanel` mounts.
**Risk:** Low. **Validation:** render test forcing the lazy import to reject and asserting hero survives; mutation check (remove boundary → test fails).

### 🟡 R-02 — "Try again" in the error boundaries cannot recover a failed chunk load — the case its own comment names
**Category:** Resilience · **Status:** CONFIRMED (code-level; React 19 `lazy` caches rejection on the module-level component object)
**Evidence:** `PanelErrorBoundary.jsx:32-37,68-82` resets by remounting the same `lazy()` singleton from `lazyPanels.js:14-18`; the cached rejection re-throws synchronously, landing back in the boundary. Identical structure in `AppErrorBoundary`. Retry works for render-time exceptions, not chunk-fetch failures.
**User impact:** The recovery affordance silently no-ops for the most likely production failure (stale chunk after deploy).
**Recommended resolution:** Retrying loader for lazy panels (re-import on failure with cache-busted dynamic import or a fresh `lazy()` per reset key).
**Risk:** Medium (touches loading seam). **Validation:** integration test: fail first import, succeed second, assert panel renders after retry.

### 🟡 R-03 — Toggling "climate context" off leaves the comparison rendered and labeled "Live"
**Category:** Resilience/UX · **Status:** CONFIRMED (re-verified: state clears only inside request/reset paths)
**Evidence:** `useClimateComparison.js:29-49` — `climateStatus` initialized from `enabled` once; toggling updates only `enabledRef`. The fetch effect ignores `climateEnabled` in deps (`useWeatherData.js:455-463`) and the re-enable effect returns early when disabled (`:484-486`). No downstream consumer gates rendering on `showClimateContext`; `HeroCard` renders `climateComparison` whenever non-null, and `SourceHealthPanel` keeps "Historical comparison: Live".
**User impact:** A user turns a feature off and it stays on screen until the next city change/refresh.
**Recommended resolution:** Effect on `climateEnabled` transition → `resetClimateComparison()` (status "disabled", data null).
**Risk:** Low. **Validation:** render test toggling the preference and asserting the hero line and source row clear.

### 🟡 A11Y-01 — Focus indicators fall below WCAG 1.4.11 on the charts — and are near-invisible inside the "rain likely" green bars
**Category:** Accessibility · **Status:** CONFIRMED (computed composite contrast; ±0.2 tolerance)
**Evidence:** The global focus ring is white at ~8.3:1 (`App.css:295-302`). Component overrides replace it with Glacier blue @ .72: `.hourly-tab/:col/:touch-sample:focus-visible` (`HourlyCard.css:86,209,569`) and `.rain-bar:focus-visible` (`RainCard.css:387`) measure **≈2.86:1** against the card — below the 3:1 non-text minimum — and the two `outline-offset:-2px` rules draw the ring *inside* the bar, where Glacier-on-green (`--chart-good-top/bottom`) measures **1.04–1.33:1**: effectively invisible on exactly the hours the design flags as most important. The radar slider substitutes a 1.85:1 glow for its outline (`RadarPanel.css:269-279`).
**User impact:** Keyboard users lose track of position precisely on rain-likely hours; this is the roving-tabindex work's payoff being spent.
**Recommended resolution:** Remove the chart-local outline overrides (inherit the global white ring), or keep Glacier but at ≥3:1 with `outline-offset:2px` so it never sits on the green fill.
**Risk:** Low (focus-only styles). **Validation:** computed-style check + manual keyboard pass at the 50%+ bars; axe won't catch this (gradient backdrop) — note in test comment.

### 🟡 A11Y-02 — Selecting a city drops keyboard focus to `<body>`
**Category:** Accessibility · **Status:** CONFIRMED
**Evidence:** `useCitySearch.js:224` — `handleSelect` calls `inputRef.current?.blur()`. The Escape path was fixed with an explicit APG-citing comment (`:234-238`); the selection path retains the regression the comment describes: next Tab restarts from the top of the document.
**User impact:** Every successful keyboard search ends with lost focus — the highest-frequency keyboard journey in the app.
**Recommended resolution:** Keep focus on the input (close popup without blur), matching the Escape fix.
**Risk:** Low. **Validation:** render test asserting `document.activeElement` after Enter-select; e2e Tab-order check.

### 🟡 A11Y-03 — The update pill's accessible name omits the state word ("saved"/"stale") its visible content carries
**Category:** Accessibility / Data trust · **Status:** CONFIRMED
**Evidence:** `GlobalUpdateIndicator.jsx:135` — `aria-label={`${updatedLabel}. Tap to refresh weather.`}` on a button whose visible children include the state word (`:142`). `aria-label` replaces the subtree; a screen-reader user hears "Updated 40m ago. Tap to refresh weather." with no indication the forecast is a *saved* one. This is the same `aria-label`-swallows-content class the forecast-row fix (August) documented — one instance remained.
**Recommended resolution:** Fold the state word into the label (or drop the `aria-label` and let content name the button).
**Risk:** Low. **Validation:** render test on the accessible name in cached state.

### 🟡 A11Y-04 — Five staggered loading live-regions announce a queue of noise on every load
**Category:** Accessibility · **Status:** CONFIRMED
**Evidence:** `CardFallback.jsx:5-15` is `role="status"` (+ redundant `aria-label` equal to its content, likely double-announcing). WeatherDashboard/Supplemental mount several on staggered timers (900/1800/2000/3000 ms, `WeatherDashboard.jsx:66-85`) — a screen-reader user hears "Loading hourly forecast… Loading precipitation radar… Loading extended weather details…" serially on every visit, for placeholders that resolve in under a second. 40 live-region declarations exist across 17 component files; `HeroCard`'s editorial reading line is also `role="status"` and re-announces on wording changes. (Counter-examples done right: the trust pill's deliberate non-live-region, and `GlobalUpdateIndicator`'s event-gated announcement.)
**Recommended resolution:** Remove `role="status"`/`aria-label` from `CardFallback` (a loading skeleton needs no announcement; `aria-busy` on the region suffices); audit the remaining regions against the "scoped and intentional" rule in AGENTS.md.
**Risk:** Low. **Validation:** manual NVDA/VoiceOver pass on load; render tests on roles.

### 🟡 DS-01 — A competing pre-Glacier cyan family survives at ~28 call sites, including the card focus/refresh vocabulary
**Category:** Design System / Glacier fidelity · **Status:** CONFIRMED
**Evidence:** Zero `#8bd3ff` remains in hex — but it survives as `rgba(139,211,255,.18)` (`HeroCard.css:518`, the hex-only migration grep's blind spot), and an adjacent cyan family (`rgba(130,228,255)`, `#84e7ff`, `rgba(64,196,255)` …) styles the card `:focus-within` ring (`WeatherDashboard.css:180-183`), the "Refreshing" chip (`:156,167`), the rain-mode toggle and touch samples (`RainCard.css:55-97,567-573`), forecast accents (`ForecastCard.css:104-293`), and 11 more sites. The Glacier spec locked `#6fb7f2` "everywhere" (§5.2). This falls **outside** the documented `fe9ed35` stopping point, which kept only *genuinely distinct* one-off values — a systematic second accent is not that.
**Portfolio impact:** Medium — visible as subtle inconsistency (two blues), and as spec non-compliance to anyone reading the Glacier doc.
**Recommended resolution:** Mechanical substitution of the cyan family to `--accent`/`--glacier` (± existing lighter tokens), exactly the class of change AGENTS.md permits as token mapping; escalate any site where cyan-vs-glacier is a deliberate semantic (none found).
**Risk:** Medium (broad but mechanical; no visual gate exists — validate with before/after computed-style diff, the technique `50cf3cb` already used).

### 🟡 DS-02 — Two broken `var()` references and one comment that swallowed a forced-colors rule — all silent
**Category:** Design System / CSS defects · **Status:** CONFIRMED
**Evidence:** `HeroCard.css:505` `var(--subcard-bg)` — token deleted (removal documented at `App.css:54-57`), declaration silently drops (currently moot: it styles the orphaned `.stat` block, see TEST-03, but it's a live tripwire). `RadarPanel.css:213,435` `var(--bg-card-hover)` — hover background never changes. `App.css:791-795` — an unterminated `/*` comment swallows the comfort-scale forced-colors rule, so the dew-point gradient bar gets no WHCM treatment and the comment truncates mid-sentence.
**Recommended resolution:** Point the two refs at surviving tokens; close the comment and restore the eaten rule. Consider a CI grep for `var(--…)` names not defined in `App.css`.
**Risk:** Low. **Validation:** computed-style diff; forced-colors manual check.

### 🟡 DS-03 — Nested tile-on-card surfaces defeat the documented AA floor on the lighter half of the condition palette
**Category:** Design System / Accessibility · **Status:** CONFIRMED (computed composites; flagged ±0.2)
**Evidence:** The token floor (`App.css:6-14`) assumes text sits on `--bg-tile` directly over the sky. But `.atm-tile` hardcodes white .15 *inside* a `--bg-large-card` white .11 section (`AtmosphereBento.css:42` × `WeatherDashboard.css:119`) → composite white ≈24.4%, past the Glacier spec's .18 tile ceiling; `--text-dim` labels there measure **≈3.7–3.8:1** on Rime Fog / Partly Cloudy / Clear gradients (pass on darker conditions — which is why it survived). Same class: the hero's warm-cream override block (`HeroCard.css:688-805`) at `.62–.68` alpha measures ≈3.9–4.2:1; four component files re-introduce the additive white `.05` wells the `--bg-well` comment says were removed for AA (`HourlyCard.css:480,531`, `StormWatch.css:170`, `RainCard.css:457`); the "ambient" group label dims to `.5` white ≈3.8-3.9:1 (`WeatherDashboard.css:88`) — the exact "hierarchy by dimming" the spec forbids; sub-11px text persists at `RainCard.css:443` (9px), `HourlyCard.css:354,387` (9.5px), `RadarPanel.css:360` (`--fs-micro:9px`) against the spec's ≥11px floor.
**User impact:** Real: glance-readability outdoors on bright-condition gradients is the product's stated use case.
**Recommended resolution (spec-anchored, not subjective):** use `--bg-panel-outer` for the bento section (the spec's nesting rule, token already exists unused) or `--bg-tile` without nesting; replace raw `rgba(244,241,234,.6x)` inks with the floored tokens (`--text-dim`/`--text-muted` — which also makes them respond to `prefers-contrast`); re-point the `.05` wells at `--bg-well`; lift the sub-11px sizes to 11px. All four moves implement written spec/token rules — no new design decisions.
**Risk:** Medium (visible surfaces, no visual gate) — validate with computed-contrast script + screenshots for owner sign-off.

### 🟡 DS-04 — The hero carries a second, warm-cream skin that overrides 12 base selectors by source order
**Category:** Design System / Maintainability · **Status:** CONFIRMED
**Evidence:** `HeroCard.css:688-805` re-declares `.hero-location`, `.hero-date`, `.hero-feels`, `.hero-trust-pill`, etc., already defined earlier in the same file, winning on order; ink shifts from spec `#eef1f8` to `#f4f1ea`; the file itself contains a doubled-class specificity workaround comment (`:402-406`) needed to beat it; the block also `display:none`s `.hero-sky-orb`, orphaning the sun/moon-orb rules (`:36-50`) and the night/dusk phase logic (`HeroCard.jsx:52` checks phases `getSunlightPhase` never returns — the entire phase feature is inert, and `hero-card--phase-*`/`data-sunlight-phase` have no CSS anywhere).
**Portfolio impact:** A reviewer reading HeroCard.css meets two conflicting designs; the AA failures of DS-03 live in this block.
**Recommended resolution:** Collapse to one declaration per selector (keeping the currently-rendered values as the survivors — this is a refactor, not a redesign); delete the orphaned orb/phase code or ticket the night-sky feature explicitly.
**Risk:** Medium (high-risk file per AGENTS.md — needs the computed-style-diff validation used by `50cf3cb`).

### 🟡 P-01 — SPA catch-all + status-only SW cache guards can poison the asset cache with HTML after a deploy
**Category:** PWA · **Status:** CONFIRMED (config-level; logic traced)
**Evidence:** `public/_redirects:5` (`/* /index.html 200`) makes a request for a purged hashed asset return `index.html` with HTTP 200. The SW's `bestEffortCacheAdd` (`sw.js:110-119`) and `cacheResponse` (`:83-90`) gate on status only, so that HTML can be cached *as* a `.js` asset; `X-Content-Type-Options: nosniff` (`_headers:12`) then blocks execution — a broken module graph that persists in cache. Narrower sibling: `networkFirstNavigation` (`sw.js:198-206`) writes fresh HTML into the *old* shell cache without its asset graph (offline-blank-screen window across a deploy boundary). Also: `_headers:19-21` serves `fonts/Inter-Variable.woff2` as `immutable, max-age=31536000` while claiming "versioned in the filename" — the filename carries no version, so a font swap is un-bustable for a year.
**Recommended resolution:** Content-type check (`text/html` → reject) before caching `/assets/*`; warn (don't silently return) in the vite stamp plugin when `sw.js` is absent; version the font filename or shorten its cache.
**Risk:** Low-medium. **Validation:** unit-style SW tests already exist for registration; add a fetch-handler test with an HTML-for-JS response.

### 🟡 D-01 — README contradicts itself and cites UI text that no longer exists
**Category:** Documentation / Portfolio · **Status:** CONFIRMED
**Evidence:** Four sites (`README.md:284,306,377,423`) and `qa-checklist.md:65` describe the hero helper note *"Some readings are unavailable from the provider"* — the string exists nowhere in `src/` (the e2e suite already documents its removal, `missing-data.spec.js:31-34`); `:423` explicitly sends a reviewer to `?mock=missing` to find it. `App.css` line count is stated as **890** at `:382` and **~500** at `:406` (actual: 877). Test counts stale: 573/120 (actual 575/121), `numbers.test.mjs` "8 tests" at `:294` vs "Ten" at `:242` (actual 10), `transforms` 6→7, `HeroCard.render` "6 tests" vs actual 19. The architecture tree lists deleted `ExposureSection` (`:96`) and omits ~20 real modules; `weatherCodes.js` listed twice. The Tech Stack omits Leaflet, react-leaflet, and Supabase — the mapping library and the only backend client. The undated "98/100/96/100" Lighthouse claim omits the enforced best-practices budget (this audit measured 99/100/100/100 on the budget route).
**Portfolio impact:** High — this is the first document a hiring manager reads, in a repo whose thesis is "the docs are honest," and `CHANGELOG:41-43` (a commit *about* fixing stale numbers) is itself now stale.
**Recommended resolution:** Single doc pass: remove the helper-note claims, reconcile counts/lines, fix the tree, add the three missing stack entries, date the Lighthouse figure. (Also fold in: qa-checklist `:22-23` now describes the *old* GPS-labeling behavior as expected — a reviewer following it would flag correct behavior as a bug.)
**Risk:** Low. **Validation:** re-run the count commands in the README's own claims.

### 🟡 D-02 — All committed screenshots predate the current UI by 5+ weeks
**Category:** Documentation / Portfolio · **Status:** CONFIRMED (viewed the PNGs this audit)
**Evidence:** All five PNGs + the webm were last regenerated 2026-07-10/27; the header value line landed 2026-08-20 (`7749ce1`). The README-embedded images show a header that no longer ships. `docs/screenshots/README.md:33` also lists the wrong viewport for the desktop trust shot (1280×900 vs the spec's 1366×900) and captions the deleted helper note. Additionally, the committed desktop capture shows the radar as a blank light rectangle (tile hosts unreachable in the capture environment) — the most visually complex feature reads as broken in the repo's front-page image.
**Recommended resolution:** Regenerate via the existing CI `browser-quality` artifact flow (local capture cannot reach tile hosts — same limitation, worth noting in the screenshots README); fix the caption/viewport rows.
**Risk:** Low. **Validation:** value line visible in regenerated captures; radar tiles present (CI can reach the hosts).

### 🟡 TEST-01 — "34 Playwright checks" includes 8 capture jobs; radar, SW-update prompt, and deep links have zero e2e coverage
**Category:** Testing · **Status:** CONFIRMED
**Evidence:** `readme-screenshots.spec.js`, `trust-contract-screenshot.spec.js`, `social-pwa-assets.spec.js` (8 tests) assert almost nothing by their own headers ("Nothing compares these against the committed copies any more") — behavioral count is 26. Untested contracts: the radar surface entirely (largest chunk, most complex feature; `?mock=missing` short-circuits it and layout specs exclude `.leaflet-container`); the "App update ready → Refresh" flow (the feature that was *completely broken* until `c533af2`); `?lat&lon` deep-link cold start (regressed once already, fixed in `aae1318`, no lock). Two soft spots: `weather-smoke.spec.js:310-312` (a `toHaveCount(0)` ordering assertion that can pass vacuously) and `:474-480` (a test that converts to a tautology if the forecast fails to render).
**Recommended resolution:** Report the split honestly in README (26 behavioral + 8 capture); add three e2e specs: radar with a stubbed RainViewer catalogue (frames render, missing-frame state, timeline), SW-update banner (two-build harness or `updatefound` simulation), and deep-link cold start.
**Risk:** Low. **Validation:** mutation-test each new spec per the project's own standard.

### 🟡 UX-01 — Radar cannot say "no coverage," so an uncovered region reads as "no rain"
**Category:** Data Trust / UX · **Status:** CONFIRMED
**Evidence:** The honest state exists (`RadarPanel.jsx:89-96`) but is reachable **only** via the `?radar=nocoverage` demo override (`rainviewer.js:47-64`); `deriveRadarState` never produces it. RainViewer's catalogue is global but its *coverage* is not: a user in an uncovered region gets `ready` frames whose tiles are transparent — a clear map that reads "no precipitation." Sibling defect: a frame whose tile URL fails to build is dropped from the map but kept in the timeline (`RadarMap.jsx:136-140`), so scrubbing to it shows a bare basemap while the readout says "Observed, 10m ago" — indistinguishable from dry. Also `distinguish`: the panel never states "no echoes in view" for a genuinely clear frame.
**Recommended resolution:** Add a persistent "Radar shows precipitation echoes only — a clear map can also mean no coverage in this region" caption (or detect empty-tile coverage where feasible); drop unbuildable frames from `frames`, not just the map.
**Risk:** Low-medium. **Validation:** unit test on frame filtering; copy review.

### 🟡 UX-02 — Hero rain guidance prints inches for °C users
**Category:** UX / Consistency · **Status:** CONFIRMED
**Evidence:** `buildHeroData.js:132` — `formatPrecipitation(amount, "F", "F")` hardcodes the display target; a °C user sees "0.12 in expected today" in the hero while RainCard (correctly threaded `weatherDataUnit`) shows mm on the same page.
**Recommended resolution:** Thread the display unit into `buildRainGuidance` as RainCard does.
**Risk:** Low. **Validation:** unit test in °C fixture.

---

### ⚪ Optional findings (verified, lower priority)

- **O-01 (Trust, LIKELY→narrow):** `buildWeekSummary` (`ForecastCard.jsx:475-480`) falls back to `delta=0` → "Stable week" when the first or last day's max is missing — a qualitative claim from missing data. Narrow (requires partial dailies), but on-contract. Guard → omit the trend phrase.
- **O-02 (Trust):** `DataTrustFooter.jsx:25-27` credits "Open-Meteo + NOAA/NWS" unconditionally, including where alerts are `unsupported` (SourceHealthPanel gets this right).
- **O-03 (Trust):** `weatherScene.js:9-11` falls back to weather-code 0 ("Clear" gradient) for background/theme when data is absent — `UNKNOWN_WEATHER` exists for exactly this; impact is gradient-only.
- **O-04 (Trust/dev):** `missingData.js:48-69` replaces (rather than spreads) `hourly`/`daily`, leaving 10 series `undefined` instead of `[]` — current consumers guard (demo verified rendering), but it's a crash tripwire in the trust demo itself; `:82-83,123` also stamp `alertsStatus:"ready"`/`alertsFetchedAt:now` for a fetch that never happened.
- **O-05 (API):** per-attempt 10s timeout → worst case ≈31s before "timed out" copy (`openMeteo.js:152,176`); and on engines without `AbortSignal.any` (Safari <17/Firefox <115) the timeout is silently dropped (`:97-105`, same in rainviewer/reverseGeocode).
- **O-06 (API):** `reverseGeocode` computes and passes a preferred `language` that the adapter never reads — `localityLanguage=en` is hardcoded (`reverseGeocode.js:75` vs `useLocation.js:540`).
- **O-07 (Perf, LIKELY):** boot forecast preload has no TTL; a delayed claim stamps old data `weatherFetchedAt: Date.now()` (`forecastPreload.js:90-101` + `useWeatherData.js:394`), feeding the freshness pill a fabricated age in the deferred-first-fetch edge.
- **O-08 (Resilience):** `useRainAlerts` never clears a stale error on a later success (`:91,111` vs `:128`); re-queries on name-only location changes (keys on the object, not coordinates); `skipNextSyncPushRef` can swallow the first backup after reconnect (`useSavedLocationsSync.js:250-300`).
- **O-09 (A11y):** radar Play button is enabled-but-inert under reduced motion (`useRadarAnimation.js:98-100` + `RadarPanel.jsx:70`, which also reads `matchMedia` un-reactively during render); Undo in SavedCitiesStrip drops focus on unmount (`SavedCitiesStrip.jsx:111-122`); Enter with no highlighted option selects `results[0]` (`useCitySearch.js:268-275`); NowcastCard's threshold semantics are `aria-hidden` with no text equivalent (RainCard's sr-only pattern is the in-repo fix); `RadarTimeline` clock uses the viewer's timezone (`:5-14`); nowcast tick axis can misalign when slots are filtered/truncated (`analyzeNowcast.js:72-94,168`).
- **O-10 (CSS):** confirmed-dead CSS: the orphaned `Stat` component + its ~60 lines (`HeroCard.css:499-548,671-682` — nothing imports `Stat.jsx` outside its own test), dead `.hero-sky-orb` rules, `.storm-module`, 5 empty media queries; `.hero-reading` + 4 tone modifiers render with zero CSS; `severity` etc. dynamic families verified LIVE — do not delete those.
- **O-11 (CSS):** the 12-column bento grid is vestigial — `WeatherDashboard.css:416-418` forces every card full-width unconditionally, leaving ~200 lines of span rules dead weight (the rendered single-column layout matches the shipped screenshots, so this is residue, not a layout bug).
- **O-12 (Arch):** duplicated micro-helpers across hooks (`isAbortError` ×3, `isBrowserOffline` ×2, city normalization ×3) while the tested `createAlertRequestTracker` abstraction sits unused by four hand-rolled equivalents; `normalizeLocationName` belongs in `domain/savedCities.js` (removes the helpers→hook import inversion, A-02).
- **O-13 (Testing):** `Stat.render.test.mjs` guards a component nothing renders (historical test for a deleted feature); CI runs the 208 render tests twice (`npm test` discovers `*.render.test.mjs` too, then `test:components` re-runs them) — so "575 + 208" double-counts; local `npm run test:e2e` silently rewrites committed PNGs (`docs/screenshots/`, `public/screenshots/`, `og-image.png`) producing spurious binary diffs for contributors (observed this run; restored).
- **O-14 (Docs):** `index.html` hard-codes `og:url` to the Netlify domain (wrong on previews), lacks canonical; `sw.js:1-5` header comment describes v3 while the constant is build-stamped; `_headers` CSP still deferred (zero inline scripts — unusually cheap to add now).

---

## G1. Top 10 highest-value improvements (Impact × Confidence ÷ Risk-Effort)

1. **T-01 — make the demo's isolation claim true.** The single highest leverage in the repo: the portfolio's proof route must not disprove itself. Confirmed, low risk, small diff; product impact medium, portfolio impact very high.
2. **D-01 + D-02 — documentation/screenshot truth-up.** Zero product risk, directly converts "reviewer finds drift" into "reviewer finds receipts." High portfolio impact.
3. **T-02 — stop restored supplemental data reading "Live."** Confirmed trust defect in the provenance panel; one function + one component; low risk, high trust impact.
4. **T-03 — pressure trend in the location's frame.** Confidently-wrong interpretive text on a common path (remote saved cities); domain-layer fix with a clean test seam; medium-high product impact.
5. **A11Y-01 + A11Y-02 — focus ring contrast + selection focus.** Restores the payoff of the existing keyboard investment; both are small, confirmed, low-risk; real user impact for keyboard/low-vision users.
6. **T-05 — one UV scale.** Removes a visible self-contradiction on the flagship card and deletes four duplicate threshold sets; low risk, medium impact both axes.
7. **R-01 — boundary around the supplemental chunk.** One wrapper prevents the only whole-app-loss path found; trivially validated by a mutation test.
8. **T-06 + T-07 — trust-language qualifiers on Nowcast/RainCard.** Copy plus small branches; closes the "language outruns data" class on the two densest precip surfaces.
9. **DS-02 — repair the silent CSS defects** (broken vars, eaten forced-colors rule). Small, confirmed, zero design judgment; unblocks trust in the token layer before any DS-01/DS-03 pass.
10. **TEST-01 — radar / SW-update / deep-link e2e.** Highest-effort item on this list, but it locks three shipped features that have each already broken (or can't currently be caught breaking) — and honesty about the 26-vs-34 split costs one README line.

(Ranking notes: DS-03/DS-04 land just off the list only because they need owner screenshot sign-off — impact is comparable to #8-9. Nothing ⚪ outranks a 🟡 here.)

## H. Product UX audit (flows)

- **Flow A — First visit:** Non-blocking Chicago fallback with explicit onboarding choice; skeletons per panel with a 7s reassurance beat; hero answers temperature/condition/feels-like/H-L/guidance within one viewport on 390px. Verified via render of the production build. The value line under the brand finally states the product thesis. **Good.** One residue: on a *total* provider failure the global error screen replaces the entire shell including the header (live-verified) — acceptable, copy is honest ("Open-Meteo forecast is unavailable"), recovery works.
- **Flow B — Search:** Debounced combobox, loading-before-empty (mocked-delay verified in e2e), grouped recent/saved idle suggestions, full keyboard nav. Two dents: focus dropped on selection (A11Y-02) and blind Enter selecting `results[0]` (O-09). Geographic disambiguation is present (name + admin + country in options).
- **Flow C — Browser location:** Permission-denied and unnamed-place paths verified in source and covered by e2e ("labels granted browser coordinates as current location"); naming failure is surfaced honestly (distinct notices).
- **Flow D — Saved locations:** Save/switch/remove/reorder/startup all covered by e2e; removing the active saved city clears startup persistence (tested). Undo focus drop is O-09.
- **Flow E — Forecast interpretation:** now → hours → rain timing → risk → week reads in the locked order; the six precipitation surfaces are ranked and labeled with distinct horizons (verified against the case-study table). The one interpretive contradiction is UV (T-05).
- **Flow F — Offline/cached:** Snapshot restore labeled "Saved" with capture time; 12h fresh window, 48h degraded ceiling with recorded rationale; offline cold-start e2e passes. T-02 is the one honest-labeling gap (supplemental rows).
- **Flow G — Supplemental failure:** Per-panel boundaries + per-source trust rows verified — with the single R-01 exception (the five-panel chunk itself).

## I. Data-trust audit — summary

The **value layer is clean** (no fake zeros; verified by systematic coercion grep + trace of every hit — §E.1). The **fresh/stale layer** is clean for the forecast, leaky for supplemental (T-02) and for the preload edge (O-07). The **interpretive-language layer** is where this audit's findings cluster: T-01 (demo banner), T-03 (pressure interpretation), T-05 (UV contradiction), T-06 (dry-window certainty), T-07 ("Observed"/silent-gap totals), UX-01 (radar's missing "no-coverage" vocabulary), O-01/O-02/O-03. Pattern for the case study: the contract was enforced where it was *written down* (numbers); the same rigor now needs to reach adjectives, labels, and self-referential claims.

`?mock=missing` at all six widths: every card in an honest unavailable state; zero suspicious strings; zero overflow; the "— means the provider didn't report that reading. It isn't a zero." footnote renders. The route's isolation claim is T-01.

## J. UI & design-system audit — summary

Glacier fidelity verified: locked accent migrated (hex-level), all 27 condition gradients deep-dusk, hero 84px/Inter-200, group-label tick system, surface tiers in-band, stacking order = owner's later revision of spec §2 (radar inserted post-hourly; Atmosphere demoted to ambient tier — Level-2 decisions superseding Level-3 spec, respected as such). Deviations that are *defects* rather than decisions: DS-01 (cyan family), DS-02 (broken refs/eaten rule), DS-03 (nesting/raw-ink AA misses + sub-11px vs the spec's own floor), DS-04 (dual hero skin). Deviations recorded as debt-by-decision and respected: raw-hex long tail (`fe9ed35`), type-scale tokens unused (26 raw sizes vs "one size per role" — flagged for the owner as spec-vs-reality, not auto-fixable without design sign-off), weight distribution (72×700 vs spec's 200-500 ladder — same).

## K. Responsive audit

Local production build, all six widths, three states (normal-with-mocked-providers, `?mock=missing`, total-network-failure): **horizontal overflow 0 px everywhere** (`documentElement.scrollWidth − clientWidth`); no clipped/suspicious text detected by pattern scan (no `NaN`/`undefined`/dangling units/`—°F`). Normal-state page height 6,817px @320 → 5,382px @1440 (the breadth decision's measurable cost: ~10.6 viewports of scroll at 320×640); hero height 646px @320 (≈101% of a 640px viewport — the e2e hero-fits-phone guard bounds this), 630px @390 (≈75% of 844px), 513px @1024+. Missing-state page height 4,542px @320 → 3,817px @1440. The e2e layout suite (text-clipping at 320/390/900, hero-fits-phone, all-8-tiles-arrive) passes and is mutation-verified per its own header. Breakpoint ladder is desktop-first, 76 `max-width` queries on a documented 7-step ladder (+3 off-ladder: 1100/480/430); 320–420px is a **tested-but-untuned band** (no rules below 420; e2e pins 320). ~15 `pointer:coarse` floors enforce 44px targets; `RainAlertsPanel` buttons (32/40px) are the one interactive surface missing the floor. `body{overflow-x:hidden}` masks rather than prevents overflow — fine while the e2e guards exist.

## L. Accessibility audit

**Automated:** axe (WCAG 2.1+2.2 AA) in CI on `/` and `?mock=missing` — passing; Lighthouse a11y 100 this run. **Manual/semantic findings:** A11Y-01…04 above, O-09 cluster; landmark/heading structure verified sound (h1→h2 groups→h3 cards, skip link, focus restoration on recovery); forced-colors block exists and is thoughtful minus the eaten rule (DS-02) and gradient-only meaning carriers (UV track, CAPE scale, radar legend, chart bars — no WHCM treatment); reduced-motion is comprehensively gated globally with correct static states (skeleton bars pinned to a sensible frame; particles removed; entrance animations forced visible) — the two genuine gaps are scroll-snap (ungated) and the inert radar Play button. Screen-reader information-preservation: the forecast-row fix holds; the two remaining name-vs-content defects are A11Y-03 and CardFallback's self-duplicating label.

## M. Performance audit

Measured this run: build 0.9s; chunks as in §E.6; Lighthouse (desktop, budget route) perf **99** / a11y **100** / best-practices **100** / SEO **100** vs budgets 85/95/90/90. Verified regression checks: radar off critical path (not preloaded, longest defer, mounts on location); Supabase chunk absent from module-preloads and gated by `hasStoredSession()` (residual: a cloud-backup-only user still pays the 201KB on mount to learn they have zero alert rules — shared-identity tradeoff, documented); supplemental panels never block core weather (deferred mounts 900–3000ms with in-code budgets); unit switch = zero requests (e2e-proven); font self-hosted, preloaded, inline `@font-face`, single variable face (the Manrope dead weight was removed in `3071693`). No premature-optimization recommendations; the only perf finding worth acting on is O-07's TTL guard.

## N. PWA / offline audit

Update lifecycle **works and is production-verified** (stamped version live; consent-gated skipWaiting; banner dedupe; controllerchange reload with backstop). Offline: app-shell precache walks the import graph (lazy chunks offline); navigation is network-first with a 3.5s lie-fi timeout and cached-shell fallback; provider data deliberately never SW-cached (freshness stays app-layer); offline cold-start restore e2e passes. Gaps: P-01 (HTML-as-asset poisoning via `_redirects` + status-only guards; stale-HTML window on deploy boundary), runtime-cache trim counts precached dupes against its own 80-entry budget, unversioned immutable font. The update *prompt* has no e2e (TEST-01).

## O. Testing audit

575 unit + 208 render (the 208 are a re-run subset — see O-13) + 26 behavioral e2e + 8 capture jobs; axe ×2; Lighthouse budgets; mutation-tested layout guards. Quality is genuinely high where it exists: negative assertions (absence of `0%`/`0 hPa`), request-counting for the unit toggle, offline SW cache polling, a provider-isolation guard (needs its host list widened, T-01). Gaps: TEST-01 trio (radar / SW-update / deep-link), the two soft assertions, the orphaned `Stat` test, missing regression locks for this audit's T-02/T-03/T-05 class (trust-language, not just trust-values).

## P. Documentation audit

README: substantial verified strength (limitations section, architecture claims that check out, machine-enforced boundaries **undersold** as prose) undermined by D-01's specifics. Case study: excellent — reads as engineering judgment, documents its own failures, records the breadth decision with a reversal trigger; should absorb this audit's "language outruns data" lesson as its next chapter. QA checklist: stale in 3 load-bearing places (D-01). Screenshots: D-02. Supabase/edge-function docs: accurate and unusually good (RLS rationale, fail-closed cron, honest env-var table).

## Q. Portfolio / hiring-manager audit

**First 60 seconds:** clear README thesis + live demo + `?mock=missing` one-click proof — strong; dented by stale screenshots (old header, blank radar) and the first spot-checked number being wrong. **Five minutes:** finds real API resilience, data contracts, a11y depth, PWA lifecycle fix with post-mortem, offline restore, machine-enforced architecture — depth is discoverable and *indexed* (Recruiter Notes). **Code review:** reinforces the story; the strongest interview artifacts are the trust-contract layers + their failure history, the SW stamping post-mortem, the composited-contrast token derivation, and the breadth-decision table. **Hidden evidence:** eslint-boundaries enforcement (one CHANGELOG line), the value line itself (absent from README), the RLS isolation script. **Claims needing proof:** the helper-note and count claims (D-01) — currently *disproof*. The gap between "strong" and "standout" is entirely in Phases 1 and 6 below.

---

## R. Remediation specifications

Specs for every 🟡 finding. Shared boilerplate: JS/JSX only; no new dependencies; conventional commits; per AGENTS.md run `npm run lint && npm test && npm run build` plus the named checks; do not touch unrelated surfaces of the high-risk files listed in AGENTS.md.

**T-01**
```text
Finding: ?mock=missing banner claims no live providers are queried; radar stack queries RainViewer/CARTO.
Goal: Make the demo's isolation claim true, and tested as stated.
Current behavior: RadarPanel + RainAlertsPanel mount under the mock; useRadarFrames polls RainViewer every 5 min.
Required behavior: Under isMissingMock, radar renders an honest "not queried in this demo" card state (reuse the
  existing radar-unavailable presentation with demo copy) and RainAlertsPanel does not mount; no request leaves
  to rainviewer/cartocdn/bigdatacloud/supabase on this route.
Files likely affected: src/hooks/useWeatherDashboardViewModel.js (expose isMissingMock), src/components/layout/
  WeatherDashboard.jsx (gate showRadarPanel/showRainAlertsPanel), src/mocks/missingData.js (banner copy if (b)),
  e2e/weather-smoke.spec.js:558 (extend monitored hosts).
Do not change: radar behavior outside the mock route; the mock's weather model; banner visual design.
Implementation risk: Low.
Acceptance criteria: network capture on /?mock=missing shows zero non-first-party requests; banner text remains
  accurate; demo still renders the radar card region (honest state), no layout hole.
Required tests: extended e2e host list; render test for the gated mounts.
Required browser validation: DevTools network tab on the production build at ?mock=missing.
```

**T-02**
```text
Finding: Restored snapshot yields SourceHealthPanel "Live" for AQI/alerts beside forecast "Saved".
Goal: Restored supplemental data is labeled as saved/cached, never "Live".
Current behavior: buildCachedTrustMeta spreads snapshot trustMeta, overriding only forecast fields.
Required behavior: cacheStatus==="restored" ⇒ aqi/alerts/climate rows render a "Saved"-class label with the
  captured-at age (mirror the forecast row), or their statuses downgrade to "cached" in buildCachedTrustMeta.
Files likely affected: src/hooks/useWeatherData.js:125-138; src/components/SourceHealthPanel.jsx:55-124.
Do not change: live-path labels; trustMeta vocabulary consumed elsewhere (grep consumers first).
Implementation risk: Low.
Acceptance criteria: restored-path render shows no "Live" label on any row sourced from the snapshot.
Required tests: unit (buildCachedTrustMeta), render (SourceHealthPanel restored fixture).
Required browser validation: offline cold-start (existing e2e path) + open the details panel.
```

**T-03**
```text
Finding: calculatePressureTrend uses device clock vs naive location timestamps; "6h" delta is 6-samples.
Goal: Pressure trend anchored to the location's wall clock over a true 6-hour window.
Current behavior: new Date() at meteorology.js:48; index-6-back at :85.
Required behavior: accept {timeZone, now} (injectable clock per repo pattern); anchor via getZonedNow +
  findWindowStartIndex; select the comparison sample by timestamp (≥5.5h..≤6.5h back, else "Not enough data").
Files likely affected: src/domain/meteorology.js; callers AtmosphereBento.jsx, StormWatch.jsx (pass timezone).
Do not change: threshold values (±1.5 hPa) or interpretation strings for valid data.
Implementation risk: Low-medium (verify both call sites pass weather.meta.timezone).
Acceptance criteria: remote-timezone fixture returns the same trend a local viewer sees; gapped series
  yields "Not enough data" rather than a stretched-window verdict.
Required tests: meteorology.test.mjs — cross-zone fixture, gap fixture, unchanged local-zone results.
Required browser validation: view a saved city 8+ zones away; bento pressure + storm why-line coherent.
```

**T-04**
```text
Finding: SunTile arc bead compares device epoch to naive rise/set.
Goal: Bead fraction computed in the location's frame.
Current behavior: AtmosphereBento.jsx:299-311 raw nowMs vs new Date(sunrise).
Required behavior: reuse buildHeroData.js:520-527's reframing (extract a shared helper in utils/sunlight.js).
Files likely affected: src/components/AtmosphereBento.jsx, src/utils/sunlight.js, src/components/heroCard/buildHeroData.js.
Do not change: formatSunTime labels (already correct); arc visual design.
Implementation risk: Low.
Acceptance criteria: cross-zone fixture places the bead at the correct fraction; local behavior unchanged.
Required tests: unit on the extracted helper; AtmosphereBento render test with remote-zone fixture.
Required browser validation: remote saved city daylight check.
```

**T-05**
```text
Finding: Five UV threshold definitions; hero reading line says "Moderate" where panel/chips say "High".
Goal: One UV scale, one vocabulary.
Current behavior: buildAtmosphereReading.js:21-22 (6=Moderate floor) vs buildHeroData.js:240-244 & chips & exposure.js.
Required behavior: export a single classifyUv(uv) → {band, label} from src/domain/exposure.js; all five sites
  consume it; reading-line copy per band: 6-8 "High UV — sun protection is worth it", ≥8 "Very high UV...".
Files likely affected: src/domain/exposure.js, src/components/heroCard/buildAtmosphereReading.js,
  src/components/heroCard/buildHeroData.js.
Do not change: band boundaries themselves (3/6/8/11 per exposure.js scale).
Implementation risk: Low.
Acceptance criteria: for any UV value, reading line, chip, and panel agree on the band word.
Required tests: unit boundary tests 5.9/6/7.9/8; render test on the hero at UV 6.5 asserting no "Moderate".
Required browser validation: none beyond render tests.
```

**T-06**
```text
Finding: Nowcast badge/chip assert "Dry window/Dry 2h" from all-null probabilities; "stays below N%" copy bug.
Goal: Scannable layer carries the same confidence as the data.
Current behavior: analyzeNowcast.js:140-152 → hasRain:false regardless of probability availability.
Required behavior: expose probabilityAvailable on the result; NowcastCard renders "Likely dry" + partial tone
  when false; copy at :151 becomes "peaks near N%" (or "reaches N%").
Files likely affected: src/components/nowcast/analyzeNowcast.js, src/components/NowcastCard.jsx.
Do not change: wet-path behavior; severity-badge vocabulary beyond adding the partial-tone use.
Implementation risk: Low.
Acceptance criteria: null-probability dry-code fixture shows qualified badge; details line unchanged.
Required tests: analyzeNowcast unit + NowcastCard render fixture.
Required browser validation: /?mock=missing nowcast card unchanged (it uses the reading-unavailable path).
```

**T-07**
```text
Finding: "Observed today" labels model output; cumulative total counts missing as 0; 48h==24h silently.
Goal: Precise provenance language on RainCard totals.
Current behavior: RainCard.jsx:389,412 "Observed"; :133-142 null→0 in running total; useRainAnalysis.js:140 clamp.
Required behavior: label "Modeled so far today" (or add the bento-style provider footnote); when missingSlots>0
  render the cumulative as "≥ X in"; when past window < requested, annotate or suppress the 48h pill.
Files likely affected: src/components/RainCard.jsx, src/hooks/useRainAnalysis.js (expose pastWindowHours).
Do not change: sums themselves; bar rendering; thresholds.
Implementation risk: Low.
Acceptance criteria: gapped fixture shows qualified total; short-history fixture distinguishes 24h vs 48h.
Required tests: useRainAnalysis unit; RainCard render fixtures.
Required browser validation: visual check that the qualifier fits the pill at 320px.
```

**R-01**
```text
Finding: SupplementalWeatherPanels lazy chunk unprotected by an error boundary.
Goal: Chunk failure degrades to one labeled card, not an app-level error screen.
Current behavior: WeatherDashboard.jsx:250-278 bare Suspense.
Required behavior: PanelErrorBoundary (label "Extended weather details", className bento-supplemental-loading,
  matching style var) wrapping the Suspense; same treatment for lazy SourceHealthPanel and SyncAccountPanel.
Files likely affected: src/components/layout/WeatherDashboard.jsx, src/components/HeaderControls.jsx.
Do not change: deferred-mount timing; the boundaries inside the chunk.
Implementation risk: Low.
Acceptance criteria: forced import rejection leaves hero/hourly/radar live with one fallback card.
Required tests: render test with a rejecting lazy mock; mutation check (boundary removed → test fails).
Required browser validation: none beyond tests.
```

**R-02**
```text
Finding: Boundary retry cannot recover a rejected lazy() chunk (React 19 caches the rejection).
Goal: "Try again" actually re-attempts the network fetch.
Current behavior: PanelErrorBoundary resetKey remounts the same lazy singleton; cached rejection re-throws.
Required behavior: lazyPanels exports a retryable factory: on failure, the next mount re-imports (fresh
  import() promise, optional cache-busting query in dev only); AppErrorBoundary soft-retry same.
Files likely affected: src/components/lazyPanels.js, src/components/PanelErrorBoundary.jsx.
Do not change: happy-path chunk caching; module-level singleton behavior on success.
Implementation risk: Medium.
Acceptance criteria: first import rejects, retry succeeds, panel renders (integration-tested).
Required tests: render test with a fail-once import stub.
Required browser validation: DevTools offline → panel fails → online → Try again recovers.
```

**R-03**
```text
Finding: Climate toggle-off leaves comparison rendered and "Live".
Goal: Disabling clears the surface within one render cycle.
Current behavior: enabled only updates a ref; no clearing effect.
Required behavior: effect on climateEnabled false→ resetClimateComparison(); status "disabled" flows to
  SourceHealthPanel (existing handling) and hero (null comparison).
Files likely affected: src/hooks/useClimateComparison.js or useWeatherData.js wiring.
Do not change: enabled-at-mount behavior; refetch-on-reenable policy.
Implementation risk: Low.
Acceptance criteria: toggle off ⇒ hero climate line gone, source row not "Live".
Required tests: useWeatherData.render.test.mjs toggle case (the existing suite covers only start-disabled).
Required browser validation: settings toggle manual check.
```

**A11Y-01 → A11Y-04, UX-01, UX-02, DS-01 → DS-04, P-01, D-01 → D-02, TEST-01** — specs follow the same shape; the binding constraints are already fully stated in each finding above (files, required behavior, validation). For the DS items: mechanical token/selector substitution and defect repair only — any judgment call (e.g. which blue a cyan site *should* be if not the accent) escalates per AGENTS.md rather than being decided by the implementer. For D-02: regeneration must run in CI (`browser-quality` artifact or a dispatch job) because local environments cannot reach tile hosts — document that constraint in docs/screenshots/README.md.

---

## S. Recommended work order

**Phase 1 — Correctness & trust (highest value, zero design risk):** T-01, T-02, T-03, T-04, T-05, T-06, T-07, R-03, UX-02, O-01/O-02/O-03.
**Phase 2 — Accessibility & core UX:** A11Y-01, A11Y-02, A11Y-03, A11Y-04, O-09 cluster (radar play/undo focus/enter-select).
**Phase 3 — Responsive & layout defects:** none found blocking (0-overflow verified); fold `RainAlertsPanel` 44px floor here.
**Phase 4 — Performance & resilience:** R-01, R-02, P-01, O-05, O-07, O-08.
**Phase 5 — Design-system residue:** DS-02 (defects first), DS-01, DS-04, DS-03 (needs owner screenshot sign-off), O-10/O-11 dead CSS (computed-style-diff validated), UX-01 copy.
**Phase 6 — Portfolio evidence:** D-01, D-02, qa-checklist refresh, TEST-01 honesty line in README, case-study addendum ("the contract's next layer: language"), surface eslint-boundaries + value line in README.
**Phase 7 — Optional enhancements:** only after the above; nothing in this audit requires new technology (§48 respected: no TS/Redux/framework/library recommendations — the stack is right for the product).

One PR per phase-item cluster, per AGENTS.md; Phases 1–2 need no design approval; Phase 5's DS-03/DS-04 need owner sign-off on screenshots.

---

## T. Validation results

```text
Command: npm ci                          Result: ✓ clean install
Command: npm run lint                    Result: ✓ 0 problems
Command: npm test                        Result: ✓ 575/575 pass, 121 suites, 17.4s
Command: npm run test:render             Result: ✓ 208/208 pass, 58 suites, 14.9s
Command: npm run build                   Result: ✓ 0.9s; initial route ≈118 KB gzip; radar+Supabase lazy
Command: npm run test:e2e -- --workers=1 Result: 30 passed / 4 failed (4.1m)
  Failure summary: the 4 failures are readme-screenshots (2) + trust-contract-screenshot (2), all timing out in
  waitForRadar → "Tuning in the latest radar" (e2e/support/visualCapture.js:73) because this container's egress
  proxy resets Chromium's external TLS tunnels (map-tile/RainViewer hosts unreachable from the browser).
  Pre-existing environment limitation, not an audit-introduced or code defect: prior audits recorded the same
  class of block, these specs pass in the repo's CI (browser-quality green on this tree), and all 26 behavioral
  specs pass locally. NOTE: the Playwright run was executed with the container's pre-installed Chromium via a
  config wrapper (repo config unchanged) because the pinned browser build is absent here.
Command: npm run test:lighthouse         Result: ✓ performance 99 / accessibility 100 / best-practices 100 /
  seo 100 against budgets 85/95/90/90 (desktop, ?mock=missing shell — the budget route by design)
Command: npm audit                       Result: ✓ 0 vulnerabilities
Side effect noted: local e2e regenerates committed PNGs (docs/screenshots, public/screenshots) — restored via
  git checkout before committing; recorded as finding O-13.
```

## U. Remaining risks & refuted findings

**Blocked from verification:** production pixel rendering (proxy; mitigated by HTTP-level deploy verification + identical-CSS local build); the 4 tile-dependent capture specs (CI-verified instead). Real-device touch/AT behavior (VoiceOver/TalkBack) was reasoned from semantics, not run on hardware — the A11Y findings that depend on AT behavior (A11Y-03, CardFallback double-announce) should be confirmed on a real screen reader during remediation.

**Findings from parallel reviews refuted during verification (recorded per the project's own standard):**
1. *"NWS returns 200-with-empty-features outside coverage, so non-US users see 'no alerts' instead of 'not covered'."* **Refuted empirically:** live probes for London, Tokyo, Toronto, Mexico City, Montreal all return **400 "point out of bounds"**, which the app correctly classifies `unsupported` (`openMeteo.js:503-510`); the e2e non-US fallback test stands.
2. *"The hero shows a sun orb at 3 AM because night/dusk phases are unreachable."* **Partially refuted:** the phases are indeed unreachable (`sunlight.js` never returns them), but `.hero-sky-orb` is `display:none` (`HeroCard.css:786-788`) — no orb renders at all. Reclassified as inert feature/dead code (DS-04, O-10), not a wrong visual.
3. *"The mobile-overflow guard is tautological."* Not re-raised: the repo's own mutation test (injected 900px element) already disproved this class of claim, and this audit's independent overflow measurement corroborates the guard.

**Uncertainties:** contrast figures are computed composites (±0.2, `backdrop-filter` ignored) — DS-03 remediation should re-measure with the repo's own derivation method; R-02's React-19 lazy-rejection caching is code-traced, not runtime-reproduced here — the required test in its spec proves it either way; O-07 (preload TTL) is LIKELY, gated on a timing edge.

## V. Final scorecard

| Category | Score | Evidence summary |
|---|---:|---|
| Product UX | 8/10 | All core flows verified working with honest states; breadth is a recorded decision; T-05/T-06 language dents |
| Weather comprehension | 8/10 | Hero answers the 5-second question; ranked precip surfaces; UV contradiction and radar "no-coverage" gap subtract |
| Data trust | 8/10 | Value layer airtight (verified by systematic grep+trace); label/language layer leaks (T-01/02/06/07); demo banner false claim is the sore spot |
| Visual hierarchy | 8/10 | 3-tier ranking real (alerts→hero→ambient); ambient tier achieved partly by dimming (spec-violating, DS-03) |
| Design consistency | 6/10 | Locked accent + gradients + type hero verified; but dual hero skin, 28-site cyan family, 7.5% type-token adoption, broken refs |
| Responsive UX | 9/10 | 0px overflow at 6 widths × 2 states measured; mutation-tested guards; 320–420 untuned band and one 32px-target panel |
| Accessibility | 7/10 | Depth well past axe (combobox, roving tabindex, sr-chart alternative) but focus-ring 1.04–2.9:1 regressions, selection blur, live-region noise |
| Frontend architecture | 9/10 | Machine-enforced boundaries; pure builders; disciplined lifecycles; minor inversions and duplicated micro-helpers |
| Resilience/state handling | 8/10 | Per-panel boundaries + trust rows + honest failure screens, minus the one unguarded chunk (R-01) and non-functional retry (R-02) |
| Performance | 9/10 | 99 LH perf against enforced budget; verified lazy discipline; ≈118KB initial; only edge-case findings |
| Testing discipline | 8/10 | 575+26 meaningful tests incl. negative + mutation-tested assertions; radar/SW-update/deep-link e2e gaps; 8 capture jobs inflate the count |
| PWA/offline quality | 8/10 | Update lifecycle fixed and production-verified; graph-walking precache; P-01 poisoning edge and no update-prompt e2e |
| Portfolio presentation | 6/10 | Exceptional case study; README self-contradicts, cites removed UI, screenshots 5+ weeks stale with a blank radar |
| Hiring-manager readiness | 8/10 | Depth is real, discoverable, and interview-rich; the docs drift is the only thing likely to cost it in a screen |

**Overall: STRONG PORTFOLIO PROJECT.** Not yet "interview-standout" for one reason with two halves: the project's differentiator is *verifiable honesty*, and right now a diligent reviewer who verifies finds (a) a README that contradicts itself and the UI, and (b) a demo route whose headline claim its own network tab disproves. Both halves are Phase 1 + Phase 6 — mechanical, evidence-backed, no design judgment required. With those closed (and the a11y focus-ring regressions fixed), the honest rating becomes INTERVIEW-STANDOUT: the underlying engineering already supports it.

## W. Final recommendation

**Next action: run Phase 1 (Correctness & Trust) as a single scoped remediation pass — T-01 through T-07 plus R-03/UX-02 — then Phase 6's D-01/D-02 documentation truth-up.** Phase 1 needs no design approval, closes every finding that touches the product's core promise, and each item carries an exact spec (§R). Phase 6 restores the docs to the standard the repo advertises. Everything else can follow at leisure; nothing here is a launch blocker.

*Implementation authorization gate honored: no application source was modified during this audit. This report is the only change.*
