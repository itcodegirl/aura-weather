# Aura Weather — Post-Audit Remediation Plan & Roadmap

**Date:** 2026-09-18
**Base:** `main` @ `b165ea9` (PR #226 merged)
**Input audit:** [`2026-09-17-competitive-ux-product-audit.md`](./2026-09-17-competitive-ux-product-audit.md), extended and partly corrected by [`2026-09-17-severe-weather-milestone-spec.md`](./2026-09-17-severe-weather-milestone-spec.md)
**Type:** Remediation plan. No source changes in this session.

This document does not re-run the audit. It converts audit findings into a prioritised, implementation-ready plan.

## Evidence conventions

`[read: path:line]` — read from this repo at `b165ea9` this session. `[live: url]` — fetched from that endpoint on 2026-09-17. `[verified-closed]` — a prior-audit finding checked against current source this session and confirmed already fixed. `[UNVERIFIED]` — not checked.

## Scoping decision, stated up front

The audit paste slot in the request arrived empty. Per the standing rule that repository documents are authoritative and never a pasted copy, the audit was read from `main`.

`docs/audit/` holds **seven** audits. A scoping decision was required and is recorded here rather than made silently:

- **Prior audits (2026-07-03, 2026-07-27, 2026-08-16, and both 2026-08-30 passes) are treated as closed**, not as input. This is not an assumption — six of their findings were sampled and verified against current source this session (§8, "Verified closed"). All six are fixed. The 2026-08-30 accessibility audit's own status header records 27 of 28 findings closed, with the one survivor marked optional and awaiting a human responsive-layout decision.
- **The "run-out series" work stream is complete.** Four findings shipped as units 7c, 8a, 8b and #2 (PRs #219, #222, #223, #226), with a decision record at `docs/decisions/resolveTodayIndex-runout.md` and a derived caller-coverage gate at `src/utils/callerCoverage.test.mjs` `[read: src/utils/callerCoverage.test.mjs:7-24]`. Nothing from it enters this register.
- **The 2026-09-17 competitive audit is the live diagnostic source**, and it is entirely unstarted: no commit since the spec landed has touched `openMeteo.js`, `AlertsCard.jsx`, `RadarPanel.jsx` or `RadarMap.jsx` `[ran: git diff --name-only 393d8d9..HEAD]`.

---

## 1. Audit executive summary

**Aura has very few defects and a large amount of desirable-but-optional work. Conflating those two would be the main way this plan could go wrong.**

The competitive audit's headline was that Aura is behind on *coverage breadth* and ahead on *honesty*. Converted into engineering terms, that produces a register of 22 findings of which only **two are genuine defects** and only **one work package is truly P0**. The rest is roadmap, and the plan says so rather than inflating it.

The two defects are both in the alert path, and both are instances of the same root cause:

1. **NWS alerts carrying `status: "Test"` render as real alerts.** `normalizeAlert` does not read `status` `[read: src/api/openMeteo.js:387-412]`. One such feature was live in the national feed when it was sampled `[live: api.weather.gov/alerts/active]`. A NWS test transmission currently displays in Aura as an active hazard.
2. **The protective-action text is discarded.** `description` is normalised and read by no component; `instruction` — the "seek shelter" string — is not normalised at all `[read: src/api/openMeteo.js:387-412; src/components/AlertsCard.jsx:140-172]`.

Both sit in the highest-consequence surface in the application, which is why they outrank everything else in the register despite being small.

The single most useful structural observation is that **six separate findings trace to one root cause**: the alert normaliser is a subset projection of the NWS CAP payload, chosen early and never revisited. Fixing them as one initiative rather than six tickets is the difference between a coherent milestone and a scattered one.

Everything else — map polygons, severity vocabulary, threshold consolidation, AQI depth, unit preferences, the unified timeline, change detection — is real work with real value and **none of it is remediation**. It is roadmap, sequenced in §12.

**Recommended next milestone is narrower than the one previously scoped.** §17 of the audit proposed a five-item milestone. Severity analysis here says items 1 and 3 are the P0/P1 core, item 2 is P1, and items 4 and 5 are P1/P2 blocked on a human design decision. The milestone in §14 takes the alert-model work only. Rationale in §14.

---

## 2. Remediation vs roadmap split

### A. Remediation — 8 findings

Work necessary to correct or strengthen the existing application.

| ID | Finding | Why it is remediation |
| --- | --- | --- |
| AUD-001 | Test alerts render as real | Incorrect critical weather information |
| AUD-002 | Protective-action text discarded | Incomplete critical weather information |
| AUD-003 | Alert onset not rendered although modelled | Data present and unused; answers "when will it affect me" |
| AUD-004 | No alert geometry | Answers "where is it"; the one severe-weather question Aura cannot answer at all |
| AUD-005 | Four competing severity vocabularies | Users cannot rank risk across cards |
| AUD-006 | One phrase, two probability thresholds | Internal contradiction in a consistency-first product |
| AUD-008 | `areaDesc` normalised but unrendered | Dead field; same root cause as AUD-002 |
| AUD-021 | `description` normalised but unread | Dead field; same root cause as AUD-002 |

### B. Roadmap — 11 findings

| ID | Finding |
| --- | --- |
| AUD-007 | Radar has no non-visual alternative |
| AUD-009 | CAP `response` unused |
| AUD-010 | AQI is one current number |
| AUD-011 | Units limited to °F/°C |
| AUD-012 | 7-day vs the 10-day consumer convention |
| AUD-013 | Hourly chart has no tabular alternative |
| AUD-014 | No forecast change detection |
| AUD-015 | Precipitation narrated across four surfaces |
| AUD-016 | No day-to-day comparison |
| AUD-020 | No in-app motion/density preference |
| AUD-022 | Competitor web-UX claims unverified in the audit |

AUD-009 is listed as roadmap by category but is **executed inside AUD-002's work package**, because it is the field that makes AUD-002 work for the 40% of alerts with no `instruction`. Recorded here so it is not double-counted.

### C. No action — 3 findings

AUD-017 (non-US alerts), AUD-018 (moon/pollen/satellite/lightning/tropical/wildfire/aviation layers), AUD-019 (dark-only theme). Reasoning in §8.

---

## 3. Audit remediation register

| ID | Finding | Category | Evidence | Impact | Severity | Recommended action | Dependency | Destination |
|---|---|---|---|---|---|---|---|---|
| AUD-001 | NWS `status: "Test"` alerts render as real | **DEFECT** | `normalizeAlert` reads no `status` `[read: src/api/openMeteo.js:387-412]`; 1 of 205 live features carried `status: "Test"` `[live]` | User: a test transmission presented as an active hazard. Eng: none | **High** | Drop features where `status !== "Actual"` | None | Immediate Remediation |
| AUD-002 | Protective-action text discarded | **DEFECT** | `AlertsCard` renders only event/headline/priority/expiry `[read: src/components/AlertsCard.jsx:140-172]`; `instruction` unparsed `[read: src/api/openMeteo.js:387-412]` | User: a tornado warning with no "what to do". Eng: none | **High** | Normalise `instruction`; render inline. Fold in AUD-009, AUD-021 | AUD-001 (same file, sequence after) | Immediate Remediation |
| AUD-003 | Alert onset modelled but not rendered | UX PROBLEM | `startsAt` normalised from `effective` `[read: src/api/openMeteo.js:405]`; card shows expiry only `[read: src/components/AlertsCard.jsx:170-172]`; 83 of 205 live alerts had a future onset `[live]` | User: cannot tell a pending alert from an active one | **Medium** | Prefer `onset`; render phase phrase | AUD-002 (same card) | Current Milestone |
| AUD-004 | No alert geometry on the map | UX PROBLEM | `normalizeAlert` reads only `feature.properties` `[read: src/api/openMeteo.js:387-392]`; no alert-geometry reference in `src/` | User: cannot tell if a warning covers them | **High** | Normalise `geometry`; draw Polygons; caption the rest | AUD-002 | Roadmap (next milestone after) |
| AUD-005 | Four severity vocabularies | UX PROBLEM | alerts 4-tier `[read: src/api/openMeteo.js:378-383]`; nowcast 3-tier `[read: src/components/NowcastCard.jsx:174-198]`; storm 5-tier `[read: src/domain/meteorology.js:15-48]` | User: cannot rank "Moderate immediate risk" vs "Level 2 of 4" | **Medium** | One domain ladder + guard test | **Human decision on rung labels** | Roadmap |
| AUD-006 | "Likely" gated at 50, rain window at 40 | ARCH / TECH DEBT | `RAIN_LIKELY_PROBABILITY = 50` `[read: src/components/RainCard.jsx:25]`; window `>= 40` `[read: src/hooks/useRainAnalysis.js:119]`; hourly 50 `[read: src/components/HourlyCard.jsx:73,80]` | User: minor. Eng: two concepts share one name | **Medium** | Name both in domain; guard against bare literals | None | Roadmap |
| AUD-007 | Radar is colour-only | **ACCESSIBILITY** | RainViewer Universal Blue `[read: src/domain/radar.js:16]`; no text alternative | Blind/colour-blind users get nothing from the map | **Medium** | Text summary beside the map | AUD-004 helps but is not required | Roadmap (near-term) |
| AUD-008 | `areaDesc` normalised, never rendered | TECH DEBT | normalised `[read: src/api/openMeteo.js:401]`; absent from card `[read: src/components/AlertsCard.jsx:140-172]` | User: no county name on the alert. Eng: dead field | **Low** | Render it, or delete it | AUD-002 | Current Milestone |
| AUD-009 | CAP `response` unused | IMPROVEMENT | Not normalised `[read: src/api/openMeteo.js:387-412]`; present on 205/205 live `[live]` | Structured one-word action, no prose parsing | **Medium** | Normalise + render chip | Executed inside AUD-002 | Current Milestone |
| AUD-010 | AQI is one current number | IMPROVEMENT | `current=us_aqi` only `[read: src/api/openMeteo.js:560-565]` | Health decisions need *when*, not *now* | **Medium** | AQI outlook + pollutants | None | Roadmap (near-term) |
| AUD-011 | Units °F/°C only | IMPROVEMENT | `[read: src/hooks/useDisplayPreferences.js:3,25-32]` | Non-US users see mph/inHg/inches | **Medium** | Extend preference model | None | Roadmap (near-term) |
| AUD-012 | 7-day vs 10-day convention | IMPROVEMENT | `.slice(0, 7)` `[read: src/components/ForecastCard.jsx:171]` | Below consumer expectation | **Low** | Extend to 10 | None | Backlog |
| AUD-013 | Hourly chart has no tabular alternative | ACCESSIBILITY | Keyboard strip exists `[read: README.md]`; no data table | Screen-reader users get navigation but not the series | **Medium** | `<table>` behind a disclosure | None | Roadmap (near-term) |
| AUD-014 | No forecast change detection | ROADMAP OPPORTUNITY | Snapshot cache exists and is versioned `[read: src/services/weatherSnapshotCache.js:3-10,181-220]` | Nobody in the category answers "did this change?" | **Medium** | Diff incoming vs retained snapshot | Cache schema work | Roadmap (mid-term) |
| AUD-015 | Precipitation narrated across 4+ surfaces | UX PROBLEM | Nowcast / Rain Outlook / Storm Watch / Week Ahead `[read: src/components/layout/SupplementalWeatherPanels.jsx:22-90]` | User integrates four cards by hand | **Medium** | Unified timeline (consolidation) | AUD-005, AUD-006 first | Roadmap (mid-term) |
| AUD-016 | No day-to-day comparison | ROADMAP OPPORTUNITY | `daily` carries the data `[read: src/api/types.js:70-81]` | "Is tomorrow better?" unanswered | **Low** | Comparison line in the 7-day | None | Roadmap (near-term) |
| AUD-017 | Non-US severe alerts absent | NO ACTION | US-only by design, disclosed `[read: README.md Known Limitations]` | — | Low | Leave; keep disclosed | — | No Action |
| AUD-018 | Missing competitor map layers, moon, pollen | NO ACTION | Competitive gap, not a defect | — | Low | Decline; documented in audit §10 | — | No Action |
| AUD-019 | Dark-only theme | ACCESSIBILITY (deferred) | `color-scheme: dark only`, documented decision `[read: index.html:9-16]` | Removes choice for light-sensitivity users | **Low** | Monitor; document in case study | Design decision | No Action (documented) |
| AUD-020 | No in-app motion/density control | IMPROVEMENT | OS-level only `[read: src/hooks/usePrefersReducedData.js]` | Per-site preference unavailable | **Low** | Preference toggle | AUD-011 (same panel) | Backlog |
| AUD-021 | `description` normalised, never read | TECH DEBT | `[read: src/api/openMeteo.js:408]`; no consumer | Eng: dead field in a risky file | **Low** | Render behind disclosure | Executed inside AUD-002 | Current Milestone |
| AUD-022 | Competitor web-UX claims unverified | DOCUMENTATION | weather.com 404 / accuweather.com 403 to automated fetch; disclosed in audit §3 and §"Open questions" | Reputational if quoted publicly | **Low** | Re-verify by hand before any public use | None | Backlog |

---

## 4. Critical findings

No finding in this register meets the **Critical** bar — no data loss, no crash, no security concern, no core functionality failure. That is stated plainly rather than manufactured: the highest severity present is High.

The two **High**-severity defects are AUD-001 and AUD-002. Both are small, both are in `src/api/openMeteo.js` and `src/components/AlertsCard.jsx`, and both are in the surface where being wrong costs the most.

AUD-004 is also High severity but is **not** a defect — it is a missing capability. It is severity-High because the user impact is high, and destination-Roadmap because nothing is currently incorrect. Severity and priority are not the same thing, and this is the clearest case of that distinction in the register.

---

## 5. Root cause analysis

### RC-1 — The alert normaliser is a subset projection of the CAP payload

**Observed:** six separate findings about missing or unused alert information — AUD-001, AUD-002, AUD-003, AUD-004, AUD-008, AUD-009, AUD-021.

**Root cause (verified):** `normalizeAlert` projects 13 fields out of the 33 the NWS payload carries `[read: src/api/openMeteo.js:387-412]`; the live payload's property keys number 33 `[live]`. The projection was chosen when the card showed four fields and has never been revisited. Three consequences follow mechanically:

- Fields the card never needed were never added (`instruction`, `response`, `status`, `geometry`, `onset`).
- Fields added speculatively were never wired (`description`, `areaDesc`) — dead weight in a risky file.
- There is no test asserting the projection is adequate, so nothing fails when the card outgrows it.

**Correct remediation:** one initiative that completes the alert model against a recorded live fixture, rather than six tickets each adding one field. Work Package WP-1.

This is the consolidation the brief asks for: **do not fix the same architectural problem six different ways.**

### RC-2 — Vocabulary and threshold constants live at the point of use

**Observed:** AUD-005 (four severity vocabularies), AUD-006 (one phrase, two numbers).

**Root cause (verified):** each surface declares its own scale inline — `getAlertPriority` in the API layer `[read: src/api/openMeteo.js:378-383]`, riskTone thresholds in a component `[read: src/components/NowcastCard.jsx:174-176]`, `classifyStormRisk` in domain `[read: src/domain/meteorology.js:15-48]`, `RAIN_LIKELY_PROBABILITY` in a component `[read: src/components/RainCard.jsx:25]`.

**Important nuance, and a correction to the parent audit.** The audit treated AUD-006 as a single inconsistency to collapse. It is not. 50 gates the *word* "likely"; 40 gates *window selection* — which hours are worth showing at all. A window selector should be more inclusive than a confidence word. `RainCard` already documents the tension in a source comment `[read: src/components/RainCard.jsx:16-24]`. The remediation is to **name and separate** the two concepts, not to unify the numbers.

**Correct remediation:** move both ladders into the domain layer with derived guard tests. The repo already has this exact pattern working twice — `src/localeSource.test.mjs` walks the tree and fails on a locale named outside its module, and `src/utils/callerCoverage.test.mjs` derives its call-site list from source rather than a comment `[read: src/utils/callerCoverage.test.mjs:7-24]`. Work Package WP-3 reuses it rather than inventing a mechanism.

### RC-3 — The radar was built as a precipitation viewer, not a hazard viewer

**Observed:** AUD-004 (no geometry), AUD-007 (no non-visual alternative).

**Root cause (hypothesis, not verified):** the radar panel's contract is frames-and-timeline; `RadarMap`'s signature is `{ host, frames, activeIndex, center, retina }` `[read: src/components/radar/RadarMap.jsx:103]` with no concept of an overlay that is not a tile layer. Nothing in the code proves this was a deliberate exclusion rather than an unbuilt feature. Marked as hypothesis.

**Correct remediation:** additive prop, no restructure. Both findings are served by treating the map as able to carry non-tile content.

### RC-4 — The dashboard grew by addition

**Observed:** AUD-015 (four precipitation surfaces), AUD-016 (no comparison), and part of AUD-005.

**Root cause (verified):** each new question got a new card. The tiering added later is real and helps — group labels carry `data-tier="act-now"` and the ambient panel is deliberately last `[read: src/components/layout/SupplementalWeatherPanels.jsx:8-11]` — but tiering reorders; it does not consolidate.

**Correct remediation:** the unified timeline, as a *consolidation* that earns its place by removing the need to join four cards. Roadmap, mid-term, and explicitly not remediation.

---

## 6. Dependencies

```
AUD-001 ──▶ AUD-002 ──┬──▶ AUD-003
(same file,            ├──▶ AUD-008
 sequence first)       ├──▶ AUD-009  (executed inside AUD-002)
                       ├──▶ AUD-021  (executed inside AUD-002)
                       └──▶ AUD-004 ──▶ AUD-007 (helps, not required)

AUD-005 ◀── BLOCKED BY human decision on rung labels
AUD-006 ──▶ AUD-005   (do the behaviour-neutral one first)
AUD-005 + AUD-006 ──▶ AUD-015  (timeline needs one vocabulary and one threshold)

AUD-011 ──▶ AUD-020   (same preferences surface)
AUD-014 ──▶ requires snapshot-cache schema work; do not widen the cache earlier
```

Stated as sentences:

- **AUD-001 blocks AUD-002** only in sequencing, not logically: both edit `normalizeAlert`, an `AGENTS.md` risky file, and each risky-file change must land as its own reviewable commit.
- **AUD-002, AUD-008, AUD-009 and AUD-021 should be resolved together** — all four originate from RC-1, and splitting them means four passes over the same function and the same card.
- **AUD-005 is blocked by a human decision**, not by code. `AGENTS.md` reserves vocabulary and visual decisions for a human. Getting that decision made early is cheaper than discovering the block at implementation time.
- **AUD-006 should precede AUD-005.** It is behaviour-neutral and exercises the guard-test pattern on low stakes before AUD-005 uses the same pattern on higher stakes.
- **AUD-015 depends on both AUD-005 and AUD-006.** A unified timeline that carries two severity vocabularies and two "likely" thresholds would harden the inconsistency into a single component.
- **AUD-014 must not start early.** Widening the snapshot-cache schema before the alert work lands couples two unrelated risky areas.

---

## 7. P0–P3 priorities

### 🔴 P0 — Critical, fix immediately

| ID | Finding | Why P0 |
| --- | --- | --- |
| AUD-001 | Test alerts render as real | Incorrect critical weather information, in the highest-stakes surface |
| AUD-002 | Protective-action text discarded | Incomplete critical weather information; the single most actionable string in the payload is dropped |

Both are small. Neither requires a design decision. Together they are the entire P0 list — the register does not pad it.

### 🟡 P1 — High priority, next remediation milestone

| ID | Finding | Why P1 |
| --- | --- | --- |
| AUD-003 | Alert onset not rendered | Data already modelled; completes the five severe-weather questions |
| AUD-008 | `areaDesc` unrendered | Same card, same pass, near-zero cost |
| AUD-009 | CAP `response` unused | Makes AUD-002 work for the 40% with no `instruction` |
| AUD-021 | `description` unread | Dead field in a risky file |
| AUD-004 | No alert geometry | High user impact; the one question Aura cannot answer |

### 🟢 P2 — Improvement, after stability

| ID | Finding |
| --- | --- |
| AUD-006 | Threshold naming and separation |
| AUD-005 | Shared severity ladder (once the human decision exists) |
| AUD-007 | Radar text alternative |
| AUD-013 | Hourly data table |
| AUD-010 | AQI outlook |
| AUD-011 | Full unit preferences |
| AUD-016 | Day comparison line |

### ⚪ P3 — Backlog

| ID | Finding |
| --- | --- |
| AUD-012 | 7-day → 10-day |
| AUD-020 | In-app motion/density preference |
| AUD-022 | Re-verify competitor web-UX claims before public use |
| AUD-014 | Forecast change detection *(P3 by timing, not by value — see §12)* |
| AUD-015 | Unified timeline *(same)* |

AUD-014 and AUD-015 are the audit's two strongest differentiators and sit in P3 only because remediation and their own dependencies come first. That is a sequencing statement, not a devaluation.

---

## 8. No-action / deferred findings

### No action

**AUD-017 — Non-US severe alerts.** NOAA/NWS coverage stops at the US border. Supporting other countries means per-country integrations, each with its own severity model and its own correctness stakes. The current behaviour is the correct one: an explicit `unsupported` status that renders "Alerts unavailable for this region" rather than a false all-clear `[read: src/components/AlertsCard.jsx:70-78]`. **Reason: refactor risk and scope exceed benefit; existing implementation is adequate and honest.**

**AUD-018 — Missing competitor layers, moon, pollen.** A missing competitor feature is not an Aura defect. The audit's §10 argues each case; nothing has changed. Pollen deserves a specific note: Open-Meteo's pollen data is Europe-only `[live: open-meteo.com/en/docs/air-quality-api]` while Aura's alerts are US-only, so shipping it produces a product where every user is missing something different. **Reason: low user impact relative to cost; would weaken product focus.**

**AUD-019 — Dark-only theme.** `color-scheme: dark only` is a documented design decision with a stated rationale — the frosted cards require a dark substrate, and half-light read as a UI bug in a prior design audit `[read: index.html:9-16]`. It does remove a choice from light-sensitivity users, which is a real cost. **Reason: deliberate design decision reserved to a human; monitor and disclose in the case study rather than silently reverse.** Reconsider if a theming pass ever happens.

### Deferred

**AUD-012 — 10-day forecast.** Cheap, but it is expectation-matching rather than problem-solving. Defer until something else touches `ForecastCard`. **Reconsider when:** AUD-016 (day comparison) lands, since it touches the same component.

**AUD-020 — In-app motion/density preference.** OS-level `prefers-reduced-motion` and `prefers-reduced-data` are already honoured. The gap is a per-site override. **Reconsider when:** AUD-011 opens the preferences panel.

**AUD-022 — Competitor web-UX claims.** The audit already labels these `[third-party]` and lists them as an open question. No code implication. **Reconsider when:** any of it is quoted in the case study or publicly.

### Verified closed — carried from prior audits, confirmed fixed this session

Checked so that no prior finding silently disappears, and so none is re-reported stale:

| Prior ID | Finding | Status |
| --- | --- | --- |
| T-01 | `?mock=missing` banner claimed no provider queries while radar queried RainViewer/CARTO | **Closed** — radar gated on `isMissingMock` `[read: src/components/layout/WeatherDashboard.jsx:86,98,241]` |
| T-02 | Restored snapshot labelled AQI/alerts "Live" beside forecast "Saved" | **Closed** — fixed at the render side, not in `buildCachedTrustMeta` as the audit proposed: `isRestored ? "Saved" : "Live"` with the rule stated in a comment `[read: src/components/SourceHealthPanel.jsx:57,73-74,113-114]` |
| T-03 / T-04 | Pressure trend and sun arc computed on the viewer's clock | **Closed** — `timeZone` threaded through `[read: src/domain/meteorology.js:94,138]` |
| T-05 | Hero said "Moderate UV" and "UV High" for one reading | **Closed** — one shared `classifyUv` `[read: src/components/heroCard/buildHeroData.js:2; buildAtmosphereReading.js:1]` |
| T-06 | "Dry window" asserted from all-null probabilities | **Closed** — qualified to "Likely dry" with the reasoning recorded `[read: src/components/nowcast/analyzeNowcast.js:198-200]` |
| T-07 | "Observed today" labelled model data | **Closed** — relabelled, with the distinction in a comment `[read: src/components/RainCard.jsx:428]` |
| P-01 | Service worker could cache HTML as JS after deploy | **Closed** — content-type guard `[read: public/sw.js:119-131]` |

Note on T-02: the audit's recommended resolution was to downgrade statuses in `buildCachedTrustMeta`. The implemented fix instead derives the label from `isRestored` at render time. `buildCachedTrustMeta` still spreads `aqiStatus`/`alertsStatus` through unchanged `[read: src/hooks/useWeatherData.js]` — so the *model* still carries "ready" for restored supplemental data while the *view* correctly says "Saved". That is a defensible choice and the user-visible defect is closed. Flagged as a latent trap for any future consumer of `trustMeta.aqiStatus` that is not `SourceHealthPanel`. **No action now; monitor.**

---

## 9. Remediation work packages

### WP-1 — Alert payload completeness

**Findings addressed:** AUD-001, AUD-002, AUD-003, AUD-008, AUD-009, AUD-021

**Problem.** `normalizeAlert` projects 13 of 33 available CAP fields `[read: src/api/openMeteo.js:387-412]` `[live]`. The projection predates the card's needs, so the most actionable information in a severe-weather payload never reaches the UI, two normalised fields are dead, and a test transmission is indistinguishable from a real hazard.

**Goal.** The alert card answers all five severe-weather questions — what, where *(WP-2)*, when, how serious, what next — from a model that is complete for the fields the card uses, and never renders a non-actual alert.

**Scope.** `status` filtering; normalise `instruction`, `response`, `onset`; render response chip, instruction inline, `description` behind a disclosure, `areaDesc` in the meta row, and an onset/time-to-impact phrase.

**Out of scope.** Geometry (WP-2). Severity vocabulary (WP-3). Parsing or translating NWS prose. Any change to priority scoring. Any layout restructure.

**Dependencies.** WP-0 (fixtures) must land first.

**Implementation direction.** Extend the existing projection with the same `typeof === "string"` discipline the sibling fields use — malformed input normalises to `""` or `null`, never to a coerced value. Add two small pure domain modules: `alertResponse.js` (CAP `response` → user label) and `alertTiming.js` (`(onsetAt, startsAt, endsAt, nowMs) → { phase, phrase }`, injectable clock, matching the `analyzeNowcast` and `calculatePressureTrend` house pattern). Keep the card's existing structure; add elements, do not rearrange.

Two evidence-driven design constraints, both from the live sample:

- `instruction` renders **inline**, not behind a disclosure — median 163 chars against `description`'s 548 `[live]`. The parent audit assumed otherwise; hiding the protective action behind a click would be the wrong call.
- When `instruction` is absent, say nothing about its absence. It is missing on 40% of alerts overall but 0% of `urgency: Immediate` `[live]`, so absence tracks low consequence. The project's own principle is that a missing answer is silence.

**Testing.**
- *Unit:* `status !== "Actual"` dropped; each new field normalises, including null/absent → `""`/`null` not `undefined`; `alertResponse` maps every CAP value and returns null for `None`/unknown; `alertTiming` covers each phase boundary, onset-absent fallback, and a malformed onset-after-expiry producing no negative countdown.
- *Component:* instruction inline and un-truncated; absent instruction produces no absence copy; `description` present in DOM inside a closed `<details>`; chip carries `aria-label`; multi-line instruction yields multiple paragraphs.
- *E2E:* one alert with all fields, one with neither, both render without error.
- *axe:* dashboard scan clean with the disclosure present.

**Acceptance criteria.**
1. A `status: "Test"` alert does not render.
2. An alert carrying `instruction` shows it without interaction and without truncation.
3. An alert without `instruction` shows no message about its absence.
4. `description` is reachable in ≤2 interactions and not visible by default.
5. A future-onset alert reads "Starts in …"; an in-progress one reads "In effect now".
6. Missing onset *and* effective degrades to today's expiry-only render.
7. No new live region; existing `role="status"` / `role="alert"` scoping unchanged.

**Risk.** **Medium** — `src/api/openMeteo.js` is an `AGENTS.md` risky file `[read: AGENTS.md "Risky Files"]`. Mitigated by recorded fixtures (WP-0) and one concern per commit.

---

### WP-0 — Recorded NWS fixtures (safety net)

**Findings addressed:** none directly. Enables WP-1 and WP-2.

**Problem.** There is no recorded NWS payload in the repo. Alert tests are synthetic, so no test asserts the normaliser handles the shapes the real feed emits — which is precisely how the projection went stale unnoticed.

**Goal.** Alert-path changes are made against real recorded payloads.

**Scope.** Commit two trimmed fixtures: a multi-alert national sample covering the four quadrants (instruction ± geometry), and the single-alert point response for the app's default city — a Hydrologic Outlook with `geometry: null` and no `instruction` `[live: api.weather.gov/alerts/active?point=41.6672,-87.7845]`, which is the degraded case, real rather than invented.

**Out of scope.** Any behaviour change. Any network call in tests.

**Implementation direction.** Follow the existing precedent: `src/api/__fixtures__/open-meteo-forecast.recorded.json` already establishes the pattern and location `[read: src/api/__fixtures__/]`. Trim to a reviewable size and record the capture date in the file.

**Testing.** The fixtures are test input. One assertion that they parse and that the quadrants they claim to cover are actually present, so a trimmed fixture cannot quietly lose its degraded case.

**Acceptance criteria.**
1. Fixtures committed with capture date.
2. All four instruction±geometry quadrants represented.
3. No test performs a network call.

**Risk.** **Low.**

---

### WP-2 — Alert location on the map

**Findings addressed:** AUD-004

**Problem.** `normalizeAlert` reads only `feature.properties`; `geometry` is discarded. The user cannot see whether a warning covers them — the one severe-weather question Aura cannot answer at all.

**Goal.** A drawable alert draws; a zone-issued alert says so plainly.

**Scope.** Normalise and validate `geometry`; convert GeoJSON `[lon, lat]` to Leaflet `[lat, lon]`; draw Polygons under the location marker; caption non-drawable alerts as "county-level alert — not drawn on map", with a count when mixed.

**Out of scope.** Resolving `affectedZones` to zone geometry — deliberately deferred. `MultiPolygon`. Polygon interaction or tooltips. Animating polygons with the timeline. Any new map layer.

**Dependencies.** WP-0, WP-1.

**Implementation direction.** Additive props only: `RadarMap`'s signature is `{ host, frames, activeIndex, center, retina }` `[read: src/components/radar/RadarMap.jsx:103]`; `RadarPanel`'s is `{ location, timeZone, style, isRefreshing }` `[read: src/components/radar/RadarPanel.jsx:79]`. `Polygon` comes from `react-leaflet`, already a dependency and already the source of `MapContainer`/`TileLayer`/`CircleMarker` `[read: src/components/radar/RadarMap.jsx:2]` — **no new dependency**.

The coordinate flip is the highest-risk line in the whole plan. GeoJSON is `[lon, lat]`, Leaflet is `[lat, lon]`; getting it wrong renders *something*, in the wrong hemisphere — it fails visibly but not loudly. It gets its own pure module and its own test, landed before anything can draw with it.

Evidence that bounds the work: every geometry in the live sample was a `Polygon` of at most 20 vertices, median 9 `[live]`. No simplification, tiling or clustering is warranted.

**Testing.**
- *Unit:* valid Polygon converts with coordinates swapped; `MultiPolygon` → null; a ring containing null/string/`NaN` → null for the whole ring, never partial; drawable/non-drawable counts correct on a mixed list; malformed geometry never throws.
- *Component:* caption absent when all drawable; present when none; correct count when mixed; absent when there are no alerts at all.
- *E2E:* a known polygon renders an SVG path inside the map container; a geometry-less alert produces the caption.
- *axe + Lighthouse:* radar scan clean; performance budget still passes.

**Acceptance criteria.**
1. A Polygon-carrying alert draws at the correct location.
2. A geometry-less alert draws nothing and produces the caption.
3. Malformed geometry never throws and never draws a partial shape.
4. The location marker is never occluded.
5. `?mock=missing` still makes zero provider requests.

**Risk.** **Medium-High** — two risky files (`openMeteo.js`, `RadarPanel.jsx`) plus the coordinate flip.

---

### WP-3 — One vocabulary, one threshold

**Findings addressed:** AUD-005, AUD-006

**Problem.** RC-2. Severity is spoken four ways; "likely" means two numbers.

**Goal.** Any two severity badges are rankable by a user without reading the card body, and no phrase in the app maps to two thresholds.

**Scope.** `src/domain/severity.js` (shared ladder + comparator) and `src/domain/precipitation.js` (`RAIN_LIKELY_PROBABILITY`, `RAIN_WINDOW_MIN_PROBABILITY`, each documented with what it gates and why they differ). Migrate `AlertsCard`, `NowcastCard`, `meteorology.js`, `RainCard`, `HourlyCard`, `useRainAnalysis`. Two derived guard tests.

**Out of scope.** Changing either probability number. Redesigning badge visuals. Changing the `--risk-*` colours. The hero's tone words — they describe comfort, not hazard.

**Dependencies.** **Human decision on rung labels and on the CAPE-band / probability mappings.** `AGENTS.md` reserves this.

**Implementation direction.** The anchor already exists and must be reused, not replaced: a six-rung ramp `--risk-low` … `--risk-extreme` `[read: src/App.css:206-211]` and a shared `.severity-badge` primitive with `--critical`/`--high`/`--moderate`/`--low`/`--minimal`/`--partial`/`--missing` modifiers `[read: src/App.css:552-594]`. `classifyStormRisk` already returns no colour precisely so the ramp stays the single source `[read: src/domain/meteorology.js:24-33]`. This is three consumers agreeing on an existing system, not a new design system.

Do AUD-006 first: it is behaviour-neutral and proves the guard pattern before AUD-005 uses it at higher stakes.

**Testing.**
- *Unit:* rungs totally ordered; comparator ranks cross-surface pairs; a missing input yields the **missing** rung, never the lowest — "Low risk" from absent data is a fake all-clear and violates the trust contract; the two probability constants are distinct and ordered (window ≤ likely).
- *Guard:* fail on any severity word outside the ladder, and on any bare rain-probability literal outside the domain module — same derived-list mechanism as `localeSource.test.mjs` and `callerCoverage.test.mjs`.
- *Component:* existing RainCard / HourlyCard / Nowcast suites must pass **unmodified**. Needing to edit an assertion means the change was not behaviour-neutral and must be reported before merge.

**Acceptance criteria.**
1. Three surfaces speak one vocabulary.
2. Missing data never renders as the lowest rung.
3. Both guard tests fail on a reintroduced rogue literal or vocabulary.
4. Existing component tests pass without modification.
5. Any copy change is reported for human review, not merged silently.

**Risk.** **Medium** — touches `HourlyCard.jsx`, an `AGENTS.md` risky file, and many surfaces. Mitigated by behaviour-neutrality being the acceptance bar.

---

## 10. Regression & testing plan

Every defect remediation carries regression protection. Tests are specified to protect behaviour, not to move a coverage number.

| Finding | Regression test | Level | Protects against |
| --- | --- | --- | --- |
| AUD-001 | `status: "Test"` feature is dropped | Unit | A test transmission ever rendering as real |
| AUD-002 | Instruction renders inline; absent instruction renders no absence copy | Unit + Component | The protective action being dropped or buried again |
| AUD-003 | Each timing phase at its boundary; onset-absent fallback; no negative countdown | Unit | Countdown arithmetic on malformed or missing times |
| AUD-004 | Coordinate flip; malformed ring → whole-ring null; mixed-set counts | Unit + E2E | A polygon in the wrong hemisphere, or a partial shape |
| AUD-005 | Missing input → missing rung, never lowest | Unit + guard | A fake all-clear from absent data |
| AUD-006 | Existing suites pass unmodified; bare-literal guard | Component + guard | A silent copy change; threshold drift |
| AUD-008 / AUD-021 | Fields present in rendered DOM | Component | Fields going dead again |
| WP-0 | Fixtures contain all four quadrants | Unit | A trimmed fixture losing its degraded case |

**Must-preserve behaviours** — verified present, must not regress in any package:

- The expired-alert filter at render time, as defence in depth `[read: src/components/AlertsCard.jsx:44-56]`.
- Alert times rendered in the **alerted location's** zone, not the reader's `[read: src/components/AlertsCard.jsx:10-22]`.
- The four-alert visible limit with an explicit overflow count `[read: src/components/AlertsCard.jsx:23,54]`.
- The `unsupported` vs `unavailable` distinction, so a coverage gap never reads as a false all-clear `[read: src/components/AlertsCard.jsx:70-80; src/api/openMeteo.js ALERTS_STATUS]`.
- Priority scoring from severity + urgency `[read: src/api/openMeteo.js:362-383]`.
- The three independent fetch tracks with their own AbortControllers `[read: README.md Architecture Decisions]`.
- `?mock=missing` making zero provider requests.
- The radar's honest empty-state caption, which refuses to claim a no-coverage state it cannot derive `[read: src/api/rainviewer.js:48-59]`.
- Existing scoped live regions; no new ones.
- The `toFiniteNumber` contract at every layer.

**Gate for every package:** `npm run lint`, `npm test`, `npm run test:render`, `npm run build`, `npm run check:docs`, `npm run test:e2e -- --workers=1`, `npm run test:lighthouse` (performance ≥0.85, accessibility ≥0.95), axe clean on `/` and `?mock=missing`.

---

## 11. Remediation sequence

**Phase 0 — Safety net.** WP-0. Recorded NWS fixtures before any normaliser change. Justified because both P0 defects are in a risky file with no real-payload coverage, which is how the projection went stale in the first place.

**Phase 1 — Critical fixes.** AUD-001, then AUD-002 (+AUD-009, +AUD-021). The two P0s.

**Phase 2 — Reliability & core UX.** AUD-003, AUD-008 (completing the card), then AUD-004 (+WP-2).

**Phase 3 — Architecture / maintainability.** AUD-006 first, then AUD-005 once the human decision exists. Both are WP-3.

**Phase 4 — Polish.** AUD-007, AUD-013.

No phase is empty and none is padded. Phases 3 and 4 are not part of the next milestone.

---

## 12. Product roadmap additions

Competitive findings are treated as **supporting product evidence**, not as proof of defect. Each row distinguishes what kind of thing it is.

### Near-term — follows remediation

| Roadmap item | Source finding | Kind | User problem | Expected value | Dependencies | Complexity | Timing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Radar text alternative | AUD-007 | **Audit finding** (accessibility) | Radar conveys nothing without colour vision | Category-first; completes the accessibility story | None | Medium | After Phase 2 |
| Hourly data table | AUD-013 | **Audit finding** (accessibility) | Chart has navigation but no readable series | Low cost, high credibility | None | Low | After Phase 2 |
| AQI outlook + pollutants | AUD-010 | **Competitive gap** (TWC ships AQI forecast) | Health decisions need *when*, not *now* | Data already in the provider API | None | Low | After Phase 2 |
| Full unit preferences | AUD-011 | **Audit finding** | Non-US users see mph/inHg/inches | Makes the app usable outside the US | None | Low | After Phase 2 |
| Day comparison line | AUD-016 | **Differentiation** (no competitor does it well) | "Is tomorrow better?" needs manual differencing | Turns a list into a narrative | None | Low | After Phase 2 |

### Mid-term

| Roadmap item | Source finding | Kind | User problem | Expected value | Dependencies | Complexity | Timing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unified decision timeline | AUD-015 | **Audit finding** (UX) + **differentiation** | Four precipitation surfaces to join by hand | Consolidation, not addition; the portfolio centrepiece | AUD-005, AUD-006 | High | After Phase 3 |
| Forecast change detection | AUD-014 | **Differentiation** (category gap) | "Did this get better or worse since I looked?" | No mainstream product answers this; cache already exists | Cache schema work | Medium | After the timeline |
| Best outdoor window | audit §11.2 | **Product opportunity** | "When should I go out?" | Six inputs → one sentence; all inputs present | AUD-005 | Medium | After the timeline |

### Future / experimental

| Roadmap item | Source finding | Kind | Why preserved, not scheduled |
| --- | --- | --- | --- |
| `affectedZones` → zone geometry | WP-2 deferral | Product opportunity | Needs per-zone fetching + caching; `affectedZones` present on 205/205 `[live]`, so the data is there when wanted |
| Forecast uncertainty (ensemble) | audit P3 | Differentiation | Fits the trust contract exactly; hard to render legibly `[UNVERIFIED: ensemble variable coverage]` |
| 10-day forecast | AUD-012 | Competitive gap | Expectation-matching; fold into any `ForecastCard` work |
| In-app motion/density preference | AUD-020 | Improvement | Fold into AUD-011's preferences panel |
| TypeScript migration of `api/` + `domain/` | audit §14 | Technical need | Strong case-study material; must not be entangled with feature work |

**Explicitly not on the roadmap**, with reasons in §8 and audit §10: 90-day forecasts, moon phase, pollen, satellite/temperature/wind/lightning layers, tropical and wildfire tracking, aviation data, user photo feeds, ads, a premium tier, and AI-generated weather prose.

---

## 13. Implementation tickets

Tickets for the next milestone only. Each is independently reviewable and testable.

### AUD-000 — Record NWS alert fixtures

**Problem.** No recorded NWS payload exists; alert tests are synthetic, so nothing asserts the normaliser handles real feed shapes.

**Evidence.** No NWS fixture in `src/api/__fixtures__/` `[read: src/api/__fixtures__/]`; the only recorded payload is Open-Meteo's forecast.

**Files likely affected.** `src/api/__fixtures__/` (new files); one new test.

**Required change.** Commit a trimmed multi-alert sample covering all four instruction±geometry quadrants, plus the Palos Hills point response (Hydrologic Outlook, `geometry: null`, no `instruction`). Record capture date in-file.

**Must preserve.** No network calls in tests.

**Dependencies.** None.

**Acceptance criteria**
- [ ] Fixtures committed with capture date
- [ ] All four quadrants present and asserted
- [ ] No test performs a network call
- [ ] Existing relevant tests pass

**Testing.** One structural assertion over the fixtures.
**Risk.** Low. **Priority.** P0 (enabler).

---

### AUD-001 — Drop non-actual NWS alerts

**Problem.** A NWS test transmission renders as an active hazard.

**Evidence.** `normalizeAlert` reads no `status` `[read: src/api/openMeteo.js:387-412]`; 1 of 205 live features carried `status: "Test"` with `event: "Test Message"` `[live]`.

**Files likely affected.** `src/api/openMeteo.js` *(risky file)*, `src/api/openMeteo.test.mjs`.

**Required change.** Normalise `status`; drop features where `status !== "Actual"` before sorting.

**Must preserve.** Priority sort order; the `unsupported`/`unavailable` status mapping; existing alert fields.

**Dependencies.** AUD-000.

**Acceptance criteria**
- [ ] A `status: "Test"` feature does not appear in the returned alerts
- [ ] An `Actual` feature is unaffected
- [ ] A feature with absent `status` is handled explicitly, and the chosen behaviour is documented in the test name
- [ ] Regression test added
- [ ] Existing relevant tests pass

**Testing.** Unit, against the recorded fixture.
**Risk.** Low. **Priority.** P0.

---

### AUD-002 — Normalise and render the protective action

**Problem.** The most actionable string in a severe-weather payload never reaches the UI.

**Evidence.** `instruction` unparsed, `description` normalised-unread, `areaDesc` normalised-unread `[read: src/api/openMeteo.js:387-412]`; card renders four fields `[read: src/components/AlertsCard.jsx:140-172]`. `instruction` present on 122/205 overall but 14/14 at `urgency: Immediate` `[live]`.

**Files likely affected.** `src/api/openMeteo.js` *(risky file)*, `src/domain/alertResponse.js` (new), `src/components/AlertsCard.jsx`, `src/components/AlertsCard.css`, tests.

**Required change.** Normalise `instruction` and `response`. Render: response chip (CAP `response` → user label), `instruction` inline and un-truncated with newlines as paragraphs, `description` inside a closed `<details>`, `areaDesc` in the meta row. When `instruction` is absent, render nothing about its absence.

**Must preserve.** The expired-alert filter; location-zone time formatting; the four-alert limit and overflow count; no new live region; the literal-escape regression guard must keep passing — NWS prose is exactly the externally-sourced input that guard exists for.

**Dependencies.** AUD-000, AUD-001.

**Acceptance criteria**
- [ ] `instruction` renders inline, unclicked, un-truncated
- [ ] Absent `instruction` produces no absence copy
- [ ] `description` is in the DOM inside a closed disclosure
- [ ] Response chip carries an `aria-label` naming the field
- [ ] A multi-line `instruction` renders as multiple paragraphs
- [ ] No new live region added
- [ ] Regression tests added
- [ ] Existing relevant tests pass; axe clean

**Testing.** Unit (normaliser, `alertResponse` map), component (render + a11y), e2e (both present and absent), axe.
**Risk.** Medium. **Priority.** P0.

---

### AUD-003 — Alert onset and time to impact

**Problem.** A pending alert is indistinguishable from an active one.

**Evidence.** Card shows expiry only `[read: src/components/AlertsCard.jsx:170-172]`; `startsAt` already normalised from `effective` `[read: src/api/openMeteo.js:405]`; `onset` present on 204/205 and in the future for 83/205 at fetch time `[live]`.

**Files likely affected.** `src/api/openMeteo.js` *(risky file)*, `src/domain/alertTiming.js` (new), `src/components/AlertsCard.jsx`, tests.

**Required change.** Normalise `onsetAt` from `properties.onset`, keeping `startsAt` for compatibility. Add a pure `alertTiming` module returning `{ phase, phrase }` from an injectable clock. Render "Starts in …" / "In effect now" / "Ends in …" beside the existing expiry. Bucket the lead time; do not render exact minutes.

**Must preserve.** Location-zone formatting of the absolute expiry; the minute-ticker recompute; no live region.

**Dependencies.** AUD-002.

**Acceptance criteria**
- [ ] Future-onset alert reads "Starts in …" before its expiry clause
- [ ] In-progress alert reads "In effect now"
- [ ] Missing onset *and* effective degrades to expiry-only
- [ ] A malformed onset-after-expiry produces no negative countdown
- [ ] No new live region
- [ ] Regression tests added
- [ ] Existing relevant tests pass

**Testing.** Unit (phase boundaries, fallbacks, malformed input), component, e2e.
**Risk.** Low-Medium. **Priority.** P1.

---

## 14. Next remediation milestone

## Milestone name

**Alert Payload Completeness**

## Objective

The alert card never shows a non-actual alert, and always shows what the user should do and when it will affect them.

## Why this comes first

Three reasons, in order of weight:

1. **It is the entire P0 list.** AUD-001 and AUD-002 are the only two findings in the register classified as defects. Everything else is a missing capability, a UX improvement, or technical debt.
2. **It is one root cause.** All four included findings trace to RC-1, and all four touch the same two files. Splitting them across milestones means repeated passes over an `AGENTS.md` risky file.
3. **Nothing in it is blocked.** No design decision is pending. AUD-005 is blocked on a human vocabulary call; AUD-004 carries the coordinate-flip risk and deserves its own milestone. Neither belongs in the first one.

**This is deliberately narrower than the five-item milestone in audit §17.** That scope bundled the map work and two consistency refactors alongside the alert-model work. Severity analysis here says the alert model is P0, geometry is P1, and the refactors are P2 with one blocked on a human. Shipping the P0 first, alone, is the correct sequencing — and it is also the smallest thing that closes a real correctness gap.

## Included findings

AUD-001, AUD-002, AUD-003, AUD-008, AUD-009, AUD-021. (AUD-008, AUD-009 and AUD-021 are executed inside AUD-002's ticket.)

## Included tickets

AUD-000, AUD-001, AUD-002, AUD-003 — in that order.

## Explicitly excluded

AUD-004 (geometry and the map — next milestone), AUD-005 (severity ladder — blocked on a human decision), AUD-006 (thresholds), AUD-007, AUD-010 through AUD-016, AUD-020. No layout restructure. No new dependency. No provider change. No TypeScript migration.

## Dependencies

AUD-000 → AUD-001 → AUD-002 → AUD-003. Strictly sequential, because three of the four touch `src/api/openMeteo.js` and each risky-file change must land as its own reviewable commit.

## Testing gate

All green on one run before the milestone closes: `npm run lint`, `npm test`, `npm run test:render`, `npm run build`, `npm run check:docs`, `npm run test:e2e -- --workers=1`, `npm run test:lighthouse`, axe clean on `/` and `?mock=missing`, and `?mock=missing` still making zero provider requests.

## Definition of done

The milestone is complete only when:

1. AUD-001, AUD-002, AUD-003, AUD-008, AUD-009 and AUD-021 are resolved.
2. Each included ticket's acceptance criteria are satisfied.
3. Regression tests exist for each: test-alert filtering, instruction presence and absence, timing phases, and field rendering.
4. All existing relevant tests pass; none were modified to accommodate a change. (If one needed modifying, the change was not behaviour-preserving and is reported before merge.)
5. No known regression introduced — specifically, every "must preserve" behaviour in §10 still holds.
6. The testing gate above is green on one run.
7. Each risky-file change landed as its own commit.
8. No new live region; no new runtime dependency.
9. `README.md` reflects the new alert-card behaviour, and `npm run check:docs` passes.
10. A screenshot of a live warning showing its protective action is captured for the case study — the audit's headline defect, visibly closed.

---

## 15. Traceability matrix

Audit finding → root cause → priority → work package → ticket → test → destination. No finding disappears.

| ID | Root cause | Priority | Work package | Ticket | Test | Destination |
|---|---|---|---|---|---|---|
| AUD-001 | RC-1 | P0 | WP-1 | AUD-001 | Unit: non-actual dropped | Milestone |
| AUD-002 | RC-1 | P0 | WP-1 | AUD-002 | Unit + component + e2e + axe | Milestone |
| AUD-003 | RC-1 | P1 | WP-1 | AUD-003 | Unit: phase boundaries | Milestone |
| AUD-004 | RC-1 + RC-3 | P1 | WP-2 | — (next milestone) | Unit: coordinate flip | Roadmap, next milestone |
| AUD-005 | RC-2 | P2 | WP-3 | — (blocked: human decision) | Guard: vocabulary | Roadmap, Phase 3 |
| AUD-006 | RC-2 | P2 | WP-3 | — | Guard: bare literals | Roadmap, Phase 3 |
| AUD-007 | RC-3 | P2 | — | — | Component | Roadmap, near-term |
| AUD-008 | RC-1 | P1 | WP-1 | inside AUD-002 | Component: field rendered | Milestone |
| AUD-009 | RC-1 | P1 | WP-1 | inside AUD-002 | Unit: response map | Milestone |
| AUD-010 | — | P2 | — | — | — | Roadmap, near-term |
| AUD-011 | — | P2 | — | — | — | Roadmap, near-term |
| AUD-012 | — | P3 | — | — | — | Backlog (fold into ForecastCard work) |
| AUD-013 | — | P2 | — | — | Component | Roadmap, near-term |
| AUD-014 | — | P3 (timing) | — | — | — | Roadmap, mid-term |
| AUD-015 | RC-4 | P3 (timing) | — | — | — | Roadmap, mid-term |
| AUD-016 | RC-4 | P2 | — | — | — | Roadmap, near-term |
| AUD-017 | — | — | — | — | — | **No Action** — scope/risk exceeds benefit (§8) |
| AUD-018 | — | — | — | — | — | **No Action** — competitive gap, not a defect (§8) |
| AUD-019 | — | — | — | — | — | **No Action** — documented design decision; monitor (§8) |
| AUD-020 | — | P3 | — | — | — | Backlog (fold into AUD-011) |
| AUD-021 | RC-1 | P1 | WP-1 | inside AUD-002 | Component: in DOM, collapsed | Milestone |
| AUD-022 | — | P3 | — | — | — | Backlog — re-verify before public use (§8) |

Prior-audit findings T-01 … T-07 and P-01 are recorded as **verified closed** in §8 with file:line evidence, so they are traceable but generate no work.

---

## 16. Immediate next actions

1. **Capture and commit the NWS fixtures (ticket AUD-000).** Startable immediately. The payloads were already sampled on 2026-09-17; re-capture at commit time so the recorded date is honest, trim to the four quadrants, and commit under `src/api/__fixtures__/` following the existing Open-Meteo precedent.

2. **Ship AUD-001 on `fix/alerts-drop-test-messages`.** Add `status` to `normalizeAlert`, drop non-`Actual` features, one unit test against the fixture. Smallest possible change to a risky file, closing a real correctness defect. No blockers.

3. **Ship AUD-002 on `feat/alerts-protective-action`.** The milestone's headline. Normalise `instruction` and `response`, add `src/domain/alertResponse.js`, render the chip, the inline instruction, the `description` disclosure and `areaDesc`. Capture the case-study screenshot while a live warning is available.

4. **Ship AUD-003 on `feat/alerts-onset-timing`.** Add `onsetAt`, add `src/domain/alertTiming.js`, render the phase phrase. Closes the milestone.

5. **Put AUD-005's rung labels to a human decision, in parallel.** Propose a five-rung ladder mapped onto the existing `--risk-*` ramp, with the CAPE-band and rain-probability mappings, and stop there. Doing this while the milestone is in flight means Phase 3 is unblocked when it arrives instead of stalling at it.

Actions 1–4 are strictly sequential. Action 5 runs alongside and blocks nothing in the milestone.
