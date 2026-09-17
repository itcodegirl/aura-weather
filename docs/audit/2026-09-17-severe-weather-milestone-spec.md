# Milestone Spec — "Severe weather, located"

**Date:** 2026-09-17
**Base:** `main` @ `f53780a`
**Parent document:** [`docs/audit/2026-09-17-competitive-ux-product-audit.md`](./2026-09-17-competitive-ux-product-audit.md) §17
**Type:** Specification and findings. No source changes in this session.

This document does **not** restate the feature matrix, gap list, non-goals, P0–P3 roadmap, scoring, or positioning. Those are in the parent audit. This is the build spec for the five items in §17, under the scope decisions recorded below.

## Scope decisions taken on top of §17

1. Milestone is §17 items 1–5.
2. **Item 2 reduced.** Draw the polygon when the NWS alert carries `geometry`; otherwise render a "county-level alert — not drawn on map" state. Resolving `affectedZones` to zone geometry is a follow-up, explicitly out of scope.
3. **Item 1 needs a presence check on `instruction`** (nullable). Done — see §0.
4. **No TypeScript migration.** The repo stays JS/JSX + JSDoc.

## Evidence conventions

`[read: path:line]` — read from this repo at `f53780a` this session. `[live: url]` — fetched from that endpoint this session. `[UNVERIFIED]` — not checked. `[design]` — a recommendation, not a fact.

---

## 0. Live NWS payload findings (drives items 1, 2 and 3)

Fetched `https://api.weather.gov/alerts/active` at **2026-09-17T20:38:43Z**, 205 active features, plus a point query for the app's default city `[live: https://api.weather.gov/alerts/active]` `[live: https://api.weather.gov/alerts/active?point=41.6672,-87.7845]`.

**This is one snapshot on one afternoon.** It is seasonally biased: no winter-weather products and no active Tornado Warnings were in the feed. Treat the ratios as indicative, the *structural* facts (which fields exist, their types) as solid, and re-check before relying on a ratio.

### Field presence across 205 active alerts

| Field | Present | Share |
| --- | --- | --- |
| `description` | 205 | 100% |
| `affectedZones` | 205 | 100% |
| `response` | 205 | 100% |
| `effective` / `expires` | 205 | 100% |
| `onset` | 204 | 99.5% |
| `ends` | 179 | 87.3% |
| **`instruction`** | **122** | **59.5%** |
| **`geometry`** | **35** | **17.1%** |

### The decisive correlation

| `urgency` | n | has `instruction` | has `geometry` |
| --- | --- | --- | --- |
| **Immediate** | 14 | **14/14 (100%)** | **14/14 (100%)** |
| Expected | 163 | 89/163 (55%) | 21/163 (13%) |
| Future | 20 | 18/20 (90%) | 0/20 (0%) |
| Unknown | 8 | 1/8 (13%) | 0/8 (0%) |

**Every alert with `urgency: Immediate` carried both the protective-action text and a drawable polygon.** Absence of either correlates with low consequence, not with a gap in the data.

By event type, `instruction` was present on 100% of every warning-grade product in the feed — Flash Flood Warning 5/5, Severe Thunderstorm Warning 3/3, Flood Warning 8/8, Flood Watch 14/14, Heat Advisory 13/13, Red Flag Warning 3/3, Fire Weather Watch 2/2 — and absent mostly on marine and informational products: Small Craft Advisory 38/95, Gale Warning 4/17, Air Quality Alert 0/7, Hydrologic Outlook 0/2.

Geometry was present on 100% of the storm-based, polygon-issued warnings (Flood Advisory 10/10, Flood Warning 8/8, Flash Flood Warning 5/5, Severe Thunderstorm Warning 3/3) and 0% of zone-issued products (all marine, Heat Advisory, Red Flag Warning, Flood Watch, Dense Fog, Rip Current, Beach Hazards, Lake Wind, Air Quality).

**Design consequence:** the "not drawn on map" state is the *majority* case by count (83%) but a *minority* case weighted by urgency (0% of Immediate). It must read as a neutral fact about how that product is issued, never as a failure or a missing feature.

### Geometry shape

All 35 geometries were `Polygon`. Vertex counts: min 4, median 9, max 20. No `MultiPolygon`, no holes observed. `[live]`

These are trivially small. No simplification, decimation, tiling or clustering is warranted, and no performance argument against drawing them survives contact with this data. `[design]`

### Text shape

| Field | Min | Median | Max |
| --- | --- | --- | --- |
| `instruction` | 42 | **163** | 1061 |
| `description` | 42 | **548** | 1505 |

116 of the 122 non-empty `instruction` values contain literal `\n` newlines. `[live]`

**This corrects an assumption in the parent audit.** §17 item 1 says to render both fields "behind a disclosure (the full NWS text is long)". That is true of `description` (median 548 chars) and false of `instruction` (median 163 chars — two short sentences). Putting the protective action behind a disclosure would hide the most actionable string in the payload behind a click.

Sample, verbatim from an active Severe Thunderstorm Warning in the feed:

> "Seek shelter inside a well-built structure and stay away from\nwindows. This storm is capable of producing damaging winds and large\nhail."

**Revised rule: `instruction` renders inline and always visible. `description` goes behind the disclosure.** `[design]`

### Two findings outside the milestone scope

1. **`status: Test` alerts render as real.** One feature in the feed carried `status: "Test"` with `event: "Test Message"`. `normalizeAlert` does not read `status` `[read: src/api/openMeteo.js:387-412]`, so a NWS test transmission would display in Aura as an active alert. Small, and it belongs in item 1's commit since that commit is already in the normaliser. Logged here so it is a decision, not an oversight.
2. **`response` is a structured, always-present protective action.** Values across the feed: `Avoid` 142, `Execute` 27, `Prepare` 21, `Monitor` 11, `Shelter` 3, `None` 1. For `urgency: Immediate` the split was `Avoid` 11, `Shelter` 3. This is a one-word CAP field that needs no prose parsing and is present on 100% of alerts. It is a better hierarchy anchor than the first sentence of `instruction`, and it covers the 40% of alerts that have no `instruction` at all. **Recommend folding it into item 1.** `[design]`

### A ready-made degraded-path fixture

The point query for the app's own default city (Palos Hills, IL — 41.6672, -87.7845) returned exactly one alert: a **Hydrologic Outlook**, `geometry: null`, no `instruction` `[live]`. That is the lower-right quadrant of the matrix (no polygon, no protective action) available as a real recorded fixture rather than a synthetic one.

---

## 1. Item 1 — Protective-action text in the alert card

### Problem

`AlertsCard` renders four fields per alert: `event`, `headline`, the priority badge, and "Until {endsAt}" `[read: src/components/AlertsCard.jsx:147-172]`. `description` is normalised `[read: src/api/openMeteo.js:408]` and read by no component. `instruction` and `response` are not normalised at all `[read: src/api/openMeteo.js:387-412]`. On an active Severe Thunderstorm Warning, Aura shows the name and the expiry and discards "Seek shelter inside a well-built structure."

### Experience

Each alert row gains, below the headline:

- A **response chip** — one word from CAP `response`, mapped to user vocabulary: `Shelter` → "Take shelter", `Evacuate` → "Evacuate", `Avoid` → "Avoid the area", `Execute` → "Follow official instructions", `Prepare` → "Prepare now", `Monitor` → "Monitor conditions". `None` and unknown values render no chip. `[design]`
- The **`instruction` text inline**, always visible, never truncated, newlines preserved as paragraph breaks.
- A **disclosure** ("Full advisory text") holding `description`, collapsed by default.

When `instruction` is absent, the row shows the response chip and the disclosure, and says nothing about the absence. There is no "no instructions provided" message: for 40% of alerts that would be noise on a low-consequence product, and the parent audit's own principle is that a missing *answer* is silence, not an apology.

### Information hierarchy

Within a row, strongest to weakest: event name → response chip → headline → instruction → time meta → disclosure. The response chip outranks the headline because it is the only element that survives being read in one second.

### States

| State | Behaviour |
| --- | --- |
| Loading | Unchanged. Existing card skeleton via `isRefreshing`. |
| Success (full) | Chip + instruction inline + collapsed description disclosure. |
| Success (partial — no `instruction`) | Chip + collapsed description disclosure. No absence message. |
| Success (partial — no `response` or `response: None`) | No chip. Instruction and disclosure unchanged. |
| Empty (no active alerts) | Unchanged `[read: src/components/AlertsCard.jsx:59-68]`. |
| Error / unsupported / unavailable | Unchanged `[read: src/components/AlertsCard.jsx:70-80]`. |
| Offline (restored snapshot) | Alerts restored from cache already drop past `endsAt`; instruction rides along with the alert object and needs no separate handling. Card's existing expiry filter still applies `[read: src/components/AlertsCard.jsx:44-56]`. |

### Mobile at 360px

Response chip sits on its own line above the instruction, not inline with the priority badge — two badges side by side at 360px wrap badly. Instruction is body copy at the card's existing size, full width, no clamp. The disclosure summary is a full-width touch target ≥44px. The existing `alerts-item-meta` block keeps its current wrap behaviour.

### Accessibility

- The response chip carries `aria-label` naming the field, not just the adjective, matching the existing priority-badge pattern `[read: src/components/AlertsCard.jsx:155-166]`.
- Instruction text is plain prose in a `<p>` — no `role`, no live region. The card is not a live region today and must not become one: alerts arriving on refresh should not interrupt a screen-reader user mid-sentence. `AGENTS.md` requires avoiding broad live-region changes.
- Disclosure is a native `<details>`/`<summary>`, matching `SourceHealthPanel` `[read: src/components/layout/WeatherDashboard.jsx:339]`.
- Newlines convert to separate `<p>` elements, not `<br>`, so screen readers pause correctly.
- The existing literal-escape regression guard must keep passing — NWS text is externally sourced prose and is exactly the input class that guard exists for `[read: README.md, e2e unicode-escape leak guard]`.

### Technical requirements

| File | Change |
| --- | --- |
| `src/api/openMeteo.js` | **RISKY FILE.** Add `instruction`, `response`, `status` to `normalizeAlert` (same `typeof === "string"` guard as siblings). Drop features where `status !== "Actual"`. |
| `src/components/AlertsCard.jsx` | Render chip, instruction, disclosure. |
| `src/components/AlertsCard.css` | Chip, instruction and disclosure styles only. No layout restructure. |
| `src/domain/` (new, small) | `alertResponse.js` — pure CAP `response` → label map. Keeps the vocabulary out of the component, per the layer rule. |

No new dependency. No provider change: `instruction`, `response` and `status` are already in the payload the app fetches `[live]`.

### Tests

- **Unit** (`openMeteo.test.mjs`): `normalizeAlert` carries `instruction`/`response`/`status`; a null/absent `instruction` normalises to `""` not `undefined`; a `status: "Test"` feature is dropped.
- **Unit** (new `alertResponse.test.mjs`): every CAP `response` value maps to a label; unknown and `None` return null.
- **Component** (`AlertsCard.render.test.mjs`): instruction renders inline; absent instruction renders no absence copy; description is present in the DOM but inside a closed `<details>`; chip has an `aria-label`; multi-line instruction produces multiple paragraphs.
- **E2E**: mock an alert with full fields and one with neither; assert both render without error.
- **axe**: existing dashboard scan must stay clean with the disclosure present.

### Acceptance criteria

1. An alert carrying `instruction` shows it inline, unclicked, un-truncated.
2. An alert without `instruction` shows no message about its absence.
3. `description` is reachable in two interactions or fewer and is not visible by default.
4. A `status: "Test"` alert does not render.
5. No new live region; no change to existing `role="status"` / `role="alert"` regions.

### Non-goals

Parsing `instruction` prose. Translating NWS text. Per-event custom copy. Any change to priority scoring.

---

## 2. Item 2 — Alert polygons on the radar map (reduced scope)

### Problem

`normalizeAlert` reads only `feature.properties` `[read: src/api/openMeteo.js:387-392]`; `feature.geometry` is discarded. Nothing in `src/` references `geometry` in an alert context — the only matches are unrelated comments in `NowcastCard`, `HourlyCard` and `buildHeroData` `[read: grep across src/]`. The user cannot see whether a warning covers them.

### Experience

When the radar panel is mounted and at least one active alert carries geometry, the polygon draws over the radar tiles, stroked in its priority colour from the existing `--risk-*` ramp, with a low-opacity fill. Multiple polygons draw together.

Beneath the map, one line of state:

- Some alerts drawn: nothing said. The map speaks.
- Alerts exist, none drawable: **"County-level alert — not drawn on map."**
- Mixed: **"1 of 3 alerts is county-level — not drawn on map."**

The wording says how the alert was *issued*, not that Aura failed. Per §0 this is the 83% case by count and the 0% case at `urgency: Immediate`, so it must be calm.

### Information hierarchy

The polygon is above radar tiles and below the location marker — the user's own position must never be occluded by a hazard polygon. The existing `CircleMarker` halo and dot render last `[read: src/components/radar/RadarMap.jsx:155-156]`.

### States

| State | Behaviour |
| --- | --- |
| Loading (radar frames pending) | Unchanged. Polygons are independent of frame loading and may draw first. |
| Success (geometry present) | Polygons drawn, no caption. |
| Success (no geometry) | No polygons, "county-level" caption. |
| Empty (no active alerts) | No polygons, no caption. |
| Error (radar tiles fail) | Existing radar error state owns the panel. Polygons are not a fallback for a broken radar and must not render into an error card. |
| Partial (alerts unavailable, radar fine) | No polygons, no caption — absence of alert data is not "county-level". |
| Offline | Restored snapshot alerts carry geometry if it was cached; if the snapshot predates this change, geometry is absent and the county-level caption is correct and honest. |

### Mobile at 360px

Polygon stroke ≥2px so it survives at the radar's z7 free-tier ceiling `[read: src/domain/radar.js:19]`. Fill opacity low enough that radar returns underneath stay readable — a hazard polygon that hides the precipitation it describes is worse than no polygon. The caption wraps to two lines and does not push the timeline below the fold.

### Accessibility

- Polygons are `aria-hidden`. Leaflet SVG overlays are not meaningfully navigable, and the honest answer for non-visual users is the text the alert card already gives, plus the caption.
- The caption is plain text, not a live region.
- Polygon colour must not be the only carrier of severity. Severity is already stated in words in `AlertsCard`; the map is a supplementary view. This must be stated in the case study rather than solved by adding map labels.
- **Known limitation to document, not fix here:** the radar remains colour-only for precipitation intensity. That is the P2 "accessible radar alternative" in the parent audit, not this milestone.

### Technical requirements

| File | Change |
| --- | --- |
| `src/api/openMeteo.js` | **RISKY FILE.** Add `geometry` to the normalised alert. Validate shape: `type === "Polygon"`, coordinates an array of rings of `[lon, lat]` pairs, each finite via `toFiniteNumber`. Anything else normalises to `null` — never a partial ring. |
| `src/domain/alertGeometry.js` (new) | Pure GeoJSON `[lon, lat]` → Leaflet `[lat, lon]` conversion, ring validation, and the count of drawable vs non-drawable alerts. |
| `src/components/radar/RadarMap.jsx` | Accept `alerts`; render `<Polygon>` from `react-leaflet` (already a dependency `[read: package.json]`). Current signature is `{ host, frames, activeIndex, center, retina }` `[read: src/components/radar/RadarMap.jsx:103]` — the prop is additive. |
| `src/components/radar/RadarPanel.jsx` | **RISKY FILE.** Accept and forward `alerts`; render the caption. Current signature `{ location, timeZone, style, isRefreshing }` `[read: src/components/radar/RadarPanel.jsx:79]`. |
| `src/components/layout/WeatherDashboard.jsx` | Pass `weather.alerts` to `RadarPanel`, as it already does to `AlertsCard` `[read: src/components/layout/WeatherDashboard.jsx:152]`. |
| `src/components/radar/RadarPanel.css` | Polygon and caption styles. |

`react-leaflet` already imports `MapContainer`, `TileLayer`, `CircleMarker`, `useMap` `[read: src/components/radar/RadarMap.jsx:2]`. `Polygon` comes from the same installed package — **no new dependency**.

The coordinate-order flip is the single highest-risk line in this milestone. GeoJSON is `[longitude, latitude]`; Leaflet is `[latitude, longitude]`. Getting it backwards renders a polygon in the wrong hemisphere and, worse, renders *something* — it fails visibly but not loudly. It gets its own pure function and its own test.

### Tests

- **Unit** (`alertGeometry.test.mjs`): a valid Polygon converts with lat/lon swapped; a `MultiPolygon` returns null; a ring with a null, string or `NaN` coordinate returns null for the whole ring, not a partial one; an empty ring returns null; the drawable/non-drawable count is correct for a mixed list.
- **Unit** (`openMeteo.test.mjs`): `geometry: null` normalises to `null`; a malformed geometry normalises to `null` and does not throw.
- **Component** (`RadarPanel.render.test.mjs`): caption absent when all alerts are drawable; "county-level" caption present when none are; mixed count correct; no caption when there are no alerts at all.
- **E2E**: mock an alert with a known polygon, assert an SVG path renders inside the map container; mock a geometry-less alert, assert the caption.
- **axe**: radar panel scan stays clean with polygons present.

### Acceptance criteria

1. A Polygon-carrying alert draws over the radar at the correct location.
2. A geometry-less alert draws nothing and produces the county-level caption.
3. Mixed sets draw what they can and count what they cannot.
4. Malformed geometry never throws and never draws a partial shape.
5. The location marker is never occluded.
6. `npm run test:lighthouse` performance budget still passes.

### Non-goals

Resolving `affectedZones` to zone geometry (follow-up). `MultiPolygon`. Polygon click/tap interaction. Tooltips on polygons. Animating polygons with the radar timeline. Any new map layer.

---

## 3. Item 3 — Onset and time-to-impact

### Problem

The card shows only "Until {expires}" `[read: src/components/AlertsCard.jsx:170-172]`. An alert that has not started yet looks identical to one in progress.

**Correction to the parent audit's framing:** §5 gap 3 says onset is missing. It is missing from the *render*, not from the *model* — `startsAt` is already normalised from `properties.effective` `[read: src/api/openMeteo.js:405]`. This is mostly a render change, plus one normaliser refinement.

That refinement: NWS carries both `effective` and `onset`, and they differ. `onset` is when the hazard begins; `effective` is when the message takes effect. `onset` was present on 204/205 alerts `[live]`. **Prefer `onset`, fall back to `effective`.** 83 of 205 alerts (40%) had an onset in the future at fetch time, so "starts in N hours" is a common state, not an edge case `[live]`.

### Experience

The time meta becomes one of three sentences, chosen by where now sits:

- **Before onset:** "Starts in 3 hours · until 9:45 PM"
- **In progress:** "In effect now · until 9:45 PM"
- **Ending soon (<60 min):** "Ends in 25 minutes"

Lead time is bucketed, not exact — "in about 3 hours", not "in 2 h 51 m". The precision of a bucketed phrase matches the precision of a forecast-issued time, and `analyzeNowcast` already establishes bucketing as the house pattern for exactly this reason `[read: src/components/nowcast/analyzeNowcast.js:32-46]`.

### Information hierarchy

Within the meta row: state phrase first, expiry second. "Starts in 3 hours" outranks "until 9:45 PM" because it is the answer to "when will it affect me".

### States

| State | Behaviour |
| --- | --- |
| Loading | Unchanged. |
| Success (onset future) | "Starts in N" + expiry. |
| Success (in progress) | "In effect now" + expiry. |
| Success (ending soon) | "Ends in N". |
| Partial (no onset and no effective) | Fall back to today's behaviour: expiry only. Never compute a lead time from a missing start. |
| Partial (no expires) | "In effect now", no expiry clause. `expires` was present on 205/205 `[live]`, so this is defensive. |
| Error / offline | Unchanged. The existing minute ticker drives recomputation `[read: src/components/AlertsCard.jsx:34-37]`. |

The card already filters alerts past `endsAt` on every minute tick, so a countdown cannot outlive its alert `[read: src/components/AlertsCard.jsx:44-56]`.

### Mobile at 360px

Two short phrases, wrapping to two lines in the existing `alerts-item-meta` block. No new row. No absolute timestamps added at this width beyond the existing expiry.

### Accessibility

- The countdown must not be a live region. A ticking `role="status"` would re-announce every minute — the exact "broad live-region change" `AGENTS.md` forbids.
- Bucketed phrases are read as written; no `<time>` ambiguity.
- The existing timezone correctness holds: times render in the alerted location's zone, not the reader's `[read: src/components/AlertsCard.jsx:10-22]`. The countdown is zone-independent (instant arithmetic) but the absolute expiry beside it is not.

### Technical requirements

| File | Change |
| --- | --- |
| `src/api/openMeteo.js` | **RISKY FILE.** Add `onsetAt` from `properties.onset`; keep `startsAt` from `effective` unchanged for compatibility. |
| `src/domain/alertTiming.js` (new) | Pure `(onsetAt, startsAt, endsAt, nowMs) → { phase, phrase }`. Injectable clock, matching `analyzeNowcast` and `calculatePressureTrend` `[read: src/domain/meteorology.js:56]`. |
| `src/components/AlertsCard.jsx` | Render the phrase. |

### Tests

- **Unit** (`alertTiming.test.mjs`): each phase at its boundary; onset absent falls back to effective; both absent yields expiry-only; an onset after its own expiry (malformed) degrades to expiry-only rather than a negative countdown; bucket edges are exact.
- **Component**: all three phrases render; no live region added.
- **E2E**: a future-onset alert shows "Starts in".

### Acceptance criteria

1. A future-onset alert reads "Starts in …" before its expiry clause.
2. An in-progress alert reads "In effect now".
3. Missing onset and effective degrade to today's expiry-only render.
4. No negative or absurd countdowns from malformed input.
5. No new live region.

### Non-goals

Exact minute countdowns. Per-second ticking. Notification scheduling from onset.

---

## 4. Item 4 — One severity vocabulary

### Problem

Four scales, verified on current source:

| Surface | Vocabulary | Tiers | Source |
| --- | --- | --- | --- |
| Alerts | critical / high / moderate / low | 4 | `[read: src/api/openMeteo.js:378-383]` |
| Nowcast | "High / Moderate / Low immediate risk" at ≥70 / ≥40 | 3 | `[read: src/components/NowcastCard.jsx:174-198]` |
| Storm Watch | Severe / High / Moderate / Low / Minimal, score 0–4 on CAPE | 5 | `[read: src/domain/meteorology.js:15-48]` |
| Hero | tone words | — | `[read: src/components/HeroCard.jsx]` |

A user cannot rank "Moderate immediate risk" against "Level 2 of 4".

### The unification anchor already exists

`App.css` defines a six-rung ramp — `--risk-low`, `--risk-moderate`, `--risk-elevated`, `--risk-high`, `--risk-severe`, `--risk-extreme` `[read: src/App.css:206-211]` — and a shared `.severity-badge` primitive with `--critical`, `--high`, `--moderate`, `--low`, `--minimal`, `--partial`, `--missing` modifiers `[read: src/App.css:552-594]`. `classifyStormRisk` already deliberately returns no colour, deferring to that ramp `[read: src/domain/meteorology.js:24-33]`.

So this is **not** a new design system. It is making three existing consumers agree on the one that is already there.

### Experience

One ladder, five rungs, one badge treatment, one colour per rung. Each surface maps its own measurement onto it and keeps its own *noun* — what differs between cards is what is being measured, not how severity is spoken.

**This item requires a human design decision** on the rung labels and on the mapping of CAPE bands and rain probabilities to rungs. `AGENTS.md` forbids agents making subjective visual and vocabulary decisions without exact instructions. This spec therefore defines the *mechanism* and stops at the *labels*.

### States

Unchanged per card. The badge for a missing input must use the existing `--partial` / `--missing` modifiers rather than defaulting to the lowest rung — "Low risk" from absent data is a fake all-clear and violates the trust contract.

### Mobile at 360px

One badge per card, existing positions. No new badges. The response chip from item 1 is a different element with a different meaning and must be visually distinguishable from a severity badge.

### Accessibility

Each badge keeps its `aria-label` naming the dimension, per the existing pattern `[read: src/components/AlertsCard.jsx:155-166]`. Severity must never be carried by colour alone — the word is the signal, the colour is reinforcement. This is already true and must stay true.

### Technical requirements

| File | Change |
| --- | --- |
| `src/domain/severity.js` (new) | The shared ladder: rung names, order, and a comparator. Pure. |
| `src/domain/meteorology.js` | `classifyStormRisk` returns a shared rung alongside its existing `level`/`score`. Additive — do not break the existing shape in the same commit. |
| `src/components/NowcastCard.jsx` | Map its 70/40 thresholds onto rungs. |
| `src/components/AlertsCard.jsx` | Map priority onto rungs. |
| `src/App.css` | Only if a rung lacks a colour. Prefer reusing the existing ramp untouched. |

### Tests

- **Unit** (`severity.test.mjs`): rungs are totally ordered; the comparator ranks cross-surface pairs correctly; a missing input yields the missing rung, never the lowest.
- **Component**: each card renders a badge from the shared ladder; a missing-data case renders the missing treatment.
- **A new guard test**: fail if any component introduces a severity word outside the shared ladder — the same "one home" enforcement pattern already used for locales `[read: README.md, src/localeSource.test.mjs]`.

### Acceptance criteria

1. Three surfaces speak one vocabulary.
2. Any two badges are rankable by a user without reading the card body.
3. Missing data never renders as the lowest rung.
4. The guard test fails on a reintroduced rogue vocabulary.
5. **Human sign-off on the rung labels before implementation.**

### Non-goals

Redesigning badge visuals. Changing the `--risk-*` colours. Touching the hero's tone words (different job — they describe comfort, not hazard).

---

## 5. Item 5 — One "rain likely" threshold

### Problem, stated more carefully than the parent audit did

Verified thresholds on current source:

| Site | Value | What it gates | Source |
| --- | --- | --- | --- |
| `RainCard` | `RAIN_LIKELY_PROBABILITY = 50` | the word "likely" | `[read: src/components/RainCard.jsx:25]` |
| `HourlyCard` | 50 | "likely" word, bar colour, threshold line | `[read: src/components/HourlyCard.jsx:73,80,238]` |
| `useRainAnalysis` | 40 | which hours enter the rain *window* | `[read: src/hooks/useRainAnalysis.js:119]` |
| `RainCard` | 40 | peak-probability copy branch | `[read: src/components/RainCard.jsx:143]` |
| `NowcastCard` | 70 / 40 | risk tone tiers | `[read: src/components/NowcastCard.jsx:174-176]` |

**These are not all the same concept, and the parent audit under-stated this.** 50 gates the *word* "likely". 40 gates *window selection* — which hours are worth showing at all. A window selector should be more inclusive than a confidence word; collapsing both to one number would either hide relevant hours or over-claim.

`RainCard` already documents this tension in a comment: a 22% hour could be selected into the window and then read "slight chance" beside the card's own 50% line `[read: src/components/RainCard.jsx:16-24]`.

### Experience

No visible change is the likely correct outcome for most of this. The deliverable is that the two concepts are **named, separated, and declared once**, so the same phrase cannot mean two numbers.

- `RAIN_LIKELY_PROBABILITY = 50` — the word "likely". One home, imported by every surface that says it.
- `RAIN_WINDOW_MIN_PROBABILITY = 40` — window inclusion. One home.
- Nowcast's 70/40 become rungs on item 4's ladder, not bare numbers.

### States

No state changes. If any copy shifts as a consequence, that is a finding to report before merging, not a silent change.

### Mobile / accessibility

No change. The `HourlyCard` 50% threshold line and its screen-reader description must stay consistent with whichever constant they read `[read: src/components/HourlyCard.jsx:402,619]`.

### Technical requirements

| File | Change |
| --- | --- |
| `src/domain/precipitation.js` (new) | Both constants, each with a comment stating what it gates and why they differ. |
| `src/components/RainCard.jsx` | Import instead of declaring. |
| `src/components/HourlyCard.jsx` | **Named a high-risk UI file in AGENTS.md.** Replace literals with imports. No visual change. |
| `src/hooks/useRainAnalysis.js` | Import the window constant. |
| `src/components/NowcastCard.jsx` | Import; tiers via item 4. |

### Tests

- **Unit**: the constants are distinct and ordered (window ≤ likely).
- **A source guard**: fail on a bare 40/50 rain-probability literal outside the domain module, mirroring the locale guard `[read: src/localeSource.test.mjs]`.
- **Component**: existing RainCard/HourlyCard/Nowcast suites must pass **unchanged**. If any assertion needs editing, the change was not behaviour-neutral and must be reported.

### Acceptance criteria

1. Two named constants, each declared once.
2. No bare rain-probability literal outside the domain module.
3. Existing component tests pass without modification.
4. Any copy change is reported for human review before merge.

### Non-goals

Changing either number. Re-tuning what "likely" means. Touching the visual threshold line.

---

## 6. Architecture work split

### Required Now — this milestone only

1. **Alert model extension** (`normalizeAlert`). Adds `instruction`, `response`, `status`, `onsetAt`, `geometry`. Additive fields, existing consumers untouched. In `src/api/openMeteo.js` — **an `AGENTS.md` risky file** `[read: AGENTS.md "Risky Files"]`. Every added field goes through the same `typeof === "string"` or `toFiniteNumber` discipline as its siblings; a malformed input normalises to `null`, never to a partial or coerced value.
2. **Four small pure domain modules**: `alertResponse.js`, `alertGeometry.js`, `alertTiming.js`, `severity.js`, plus `precipitation.js`. Each is pure, directly unit-testable, and sits where the dependency rule requires. This is the existing house pattern — `analyzeNowcast`, `meteorology`, `exposure`, `radar` are all this shape.
3. **One additive prop on two radar components.** `RadarMap` gains `alerts`; `RadarPanel` gains and forwards it. `RadarPanel.jsx` is **an `AGENTS.md` risky file**.
4. **Two source-guard tests** (severity vocabulary, rain literals), following the locale guard already in the repo.

No rewrites. No new dependencies. No layout restructure. No hook refactors.

### Required Soon — the next two milestones, not this one

- **Unified decision timeline (P1).** Needs a shared time-scale primitive that `HourlyCard`, the nowcast and the alert time-extents can all read. Do not build it now; but when item 3 creates `alertTiming.js`, keep its output shape (`phase`, instants) consumable by a future timeline rather than pre-formatted strings only. That is the one forward-compatibility constraint this milestone should honour, and it costs nothing.
- **Forecast change detection (P2).** Needs the snapshot cache to retain a prior model alongside the current one `[read: src/services/weatherSnapshotCache.js]`. Untouched by this milestone. Do not widen the cache schema here.

### Future

- `affectedZones` → zone geometry resolution (the deferred half of item 2). Requires an additional NWS endpoint per zone and a caching strategy; `affectedZones` was present on 205/205 alerts `[live]`, so the data is there when it is wanted.
- Accessible radar text alternative (P2).
- TypeScript migration of `src/api/` and `src/domain/` — explicitly out of scope per the scope decisions, and should not be entangled with feature work.

### Risky-file discipline

`AGENTS.md` names `src/api/openMeteo.js`, `src/components/radar/RadarPanel.jsx`, `src/components/HourlyCard.jsx` and `src/components/ForecastCard.jsx` as requiring extra caution `[read: AGENTS.md "Risky Files"]`. Three of the four are touched here. Consequence for sequencing: **each risky-file change lands in its own commit with its own tests, never bundled with a second concern.** The checklist in §8 is ordered to make that possible.

---

## 7. Milestone Definition of Done

Observable criteria. Each is checkable by running something or looking at something.

**Behaviour**

1. An alert carrying `instruction` displays it without interaction; one without it shows no absence message.
2. `description` is reachable and not visible by default.
3. A `status: "Test"` alert does not render.
4. A Polygon-carrying alert draws on the radar at the correct coordinates, under the location marker.
5. A geometry-less alert produces "county-level alert — not drawn on map"; a mixed set produces the correct count.
6. A future-onset alert reads "Starts in …"; an in-progress one reads "In effect now".
7. `AlertsCard`, `NowcastCard` and `StormWatch` render severity from one ladder.
8. Missing data renders the missing treatment on every badge, never the lowest rung.

**Contract**

9. No fake zero, no fake all-clear: absent `instruction`, `geometry`, `onset` or severity input renders as absent or omitted, never as a default value.
10. No new live region; existing `role="status"` / `role="alert"` scoping unchanged.
11. No new runtime dependency in `package.json`.

**Verification** — all green on one run:

12. `npm run lint`
13. `npm test`
14. `npm run test:render`
15. `npm run build`
16. `npm run check:docs`
17. `npm run test:e2e -- --workers=1`
18. `npm run test:lighthouse` — performance ≥0.85, accessibility ≥0.95 `[read: README.md "Honest Lighthouse budgets"]`
19. axe-core clean on `/` and `?mock=missing`
20. `?mock=missing` still makes zero provider requests — the demo-isolation guard must survive the radar change

**Process**

21. Each risky-file change is its own commit with its own tests.
22. Item 4's rung labels carry human sign-off before implementation.
23. Any copy change from item 5 is reported, not merged silently.

---

## 8. Implementation checklist

Ordered smallest and highest-consequence first. Each line is one narrow commit with its own tests.

| # | Commit | Files | Risky | Why here |
| --- | --- | --- | --- | --- |
| 1 | `fix(alerts): drop non-Actual NWS test alerts` | `openMeteo.js`, test | ⚠️ | Smallest possible change to a risky file. A live defect. Lands alone so its diff is unmissable. |
| 2 | `feat(alerts): normalise instruction, response and onset` | `openMeteo.js`, test | ⚠️ | Model-only. No UI. Proves the fields arrive before anything renders them. |
| 3 | `feat(domain): CAP response vocabulary` | `alertResponse.js` + test | | Pure, isolated, no consumer yet. |
| 4 | `feat(alerts): render protective action in the alert card` | `AlertsCard.jsx/.css`, render test, e2e | | **The milestone's highest-consequence user-visible change.** First thing a reviewer sees working. |
| 5 | `feat(domain): alert timing phases` | `alertTiming.js` + test | | Pure. Boundary cases locked before render. |
| 6 | `feat(alerts): show onset and time to impact` | `AlertsCard.jsx`, render test, e2e | | Consumes #5. |
| 7 | `feat(domain): alert polygon geometry conversion` | `alertGeometry.js` + test | | **Pure lat/lon flip, tested before it can be drawn wrong.** |
| 8 | `feat(alerts): carry alert geometry through the model` | `openMeteo.js`, test | ⚠️ | Third and last risky-file touch, alone. |
| 9 | `feat(radar): draw alert polygons on the map` | `RadarMap.jsx`, `RadarPanel.jsx/.css`, `WeatherDashboard.jsx`, render test, e2e, axe | ⚠️ | Largest UI change; lands on a proven model and a tested converter. |
| 10 | `refactor(domain): one home for rain probability thresholds` | `precipitation.js`, `RainCard`, `HourlyCard`, `useRainAnalysis`, guard test | ⚠️ | Behaviour-neutral. Existing tests must pass untouched — the proof it is neutral. |
| 11 | `feat(domain): shared severity ladder` | `severity.js` + test + guard | | Pure. **Blocked on human sign-off of rung labels.** |
| 12 | `refactor(ui): one severity vocabulary across cards` | `AlertsCard`, `NowcastCard`, `meteorology.js`, tests | | Last: it touches the most surfaces and benefits from everything else being settled. |

Commits 1–9 are independently shippable. Commits 10–12 are the consistency pass and could be a second PR if the first grows large.

---

## 9. Next 5 actions, in order

**1. Cut `feat/alerts-drop-test-messages` off `main` and ship checklist commit #1.**
Startable immediately. No blockers, no design input, no open questions. Add `status` to `normalizeAlert` `[read: src/api/openMeteo.js:387-412]`, drop features where `status !== "Actual"`, add the unit test using the `Test Message` shape recorded in §0. One risky file, one concern, a real defect closed.

**2. Ship checklist commits #2 and #3** — normalise `instruction`, `response` and `onsetAt`; add `alertResponse.js`. Model and vocabulary only, still nothing rendered.

**3. Ship checklist commit #4** — render the protective action. This is the milestone's headline and the point at which the audit's P0 is actually closed for a user. Capture a screenshot of a live warning with its instruction for the case study.

**4. Put item 4's rung labels to a human decision.** Propose a five-rung ladder with the CAPE-band and rain-probability mappings, and stop. `AGENTS.md` forbids agents choosing this. Doing it now means the answer is ready when the checklist reaches commit #11, instead of blocking there.

**5. Ship checklist commits #5 through #9** — timing, geometry conversion, geometry in the model, polygons on the map. The lat/lon converter (#7) lands and is tested before anything can draw with it.

---

## 10. Open questions

1. Rung labels and threshold mappings for item 4. **Human decision, blocking commit #11.** `[design]`
2. Whether any item 5 copy shifts once the constants are imported rather than inlined. Determinable only by running the suites. `[UNVERIFIED]`
3. Whether `instruction` and `geometry` presence ratios hold across seasons — the §0 snapshot has no winter products and no active Tornado Warning. The structural facts hold regardless; the ratios should be re-sampled before being quoted. `[UNVERIFIED]`
4. Whether `MultiPolygon` ever appears on NWS alerts. 0 of 35 in this snapshot; the spec treats it as null. `[UNVERIFIED]`
5. Whether the restored-snapshot path caches `geometry`. Needs a read of `weatherSnapshotCache` serialisation before commit #9. `[UNVERIFIED]`

---

## Sources

**Repository, read at `f53780a` this session:** `src/api/openMeteo.js`, `src/components/AlertsCard.jsx`, `src/components/NowcastCard.jsx`, `src/components/HourlyCard.jsx`, `src/components/RainCard.jsx`, `src/components/StormWatch.jsx`, `src/components/radar/RadarPanel.jsx`, `src/components/radar/RadarMap.jsx`, `src/components/layout/WeatherDashboard.jsx`, `src/domain/meteorology.js`, `src/domain/radar.js`, `src/hooks/useRainAnalysis.js`, `src/App.css`, `AGENTS.md`, `README.md`, `package.json`, `docs/audit/2026-09-17-competitive-ux-product-audit.md`.

**Live, fetched 2026-09-17T20:38Z:**

- `https://api.weather.gov/alerts/active` — 205 active features
- `https://api.weather.gov/alerts/active?point=41.6672,-87.7845` — Palos Hills, IL
