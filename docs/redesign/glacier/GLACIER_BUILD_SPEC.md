# Aura — "Glacier" Redesign · Locked Build Spec

**Status:** Source of truth for the Glacier redesign build.
**Repo:** `itcodegirl/aura-weather`
**Supersedes:** the narrative agreement in chat + the closed PR #81 and the not-yet-merged PR #82.

---

## 0 · How to use this spec — READ FIRST

This spec exists because a prior build (#81) did the easy parts, skipped the hard parts, and declared itself done. The rules below make that impossible.

1. **The mockups in `./mockups/` are the source of truth — not this prose, and not your memory of the conversation.** Open `./mockups/index.html` and look at every CANONICAL tile before writing any code. When this document and a mockup disagree, **the mockup wins.**
2. **"Done" has a hard definition (see §7).** A component is done only when (a) it visually matches its reference mockup on the listed criteria, (b) it passes lint + the existing test suite, and (c) **Jenna has signed off on the live Netlify preview.** You do **not** get to certify your own work as done. No "looks good in my screenshot → merge."
3. **This is a surgical restyle, not a rebuild.** The app is already a mature dark-glass system (reactive `background` prop, animated particles, token system in `App.css`, full missing-data trust contract, a11y). Keep all engineering and data. Restyle the surface and add only the named new pieces.
4. **Closed scope.** If something isn't covered by a CANONICAL mockup + a section below, it is **out of scope** — stop and ask. Do not invent components, do not "improve" beyond the mockups, do not skip a listed component because you judge it redundant. The two former open decisions (bento, accent) are now **resolved** in §5 — execute them as written.
5. **One commit per component/phase**, authored as `itcodegirl`. Hard stop before any push or PR (see the handoff doc).

---

## 1 · Design tokens — EXACT (audited from the canonical mockups)

These values are extracted from `aura_full_dashboard_glacier_assembled`, `aura_animated_reactive_hero`, and `aura_flowing_hourly_metric_selector`. Put them in the token layer (`App.css` `:root` / existing token vars). Do not approximate.

### Brand + semantic colors
| Role | Value | Notes |
|---|---|---|
| **Brand accent — "Glacier blue"** | `#6fb7f2` | The primary accent. Group-label ticks, active chips, links, focus rings, curve strokes. |
| Glacier blue — secondary/values | `#9cc9f2`, `#bcdcfa`, `#aecdf2` | Lighter blue for secondary text/markers on dark. |
| **Warm amber** (semantic: warning / storm-risk / comfort / pressure / golden-hour) | `#f3b765` (also `#efb05a`, `#f4bd6f`, `#f5cd92`) | Keep this — Jenna explicitly wants the warm cues; "makes it look alive… not so gloomy." |
| Semantic good / AQI-good / "in range" | `#7fd99a` / `#a9e2bd` | Green stays green regardless of accent. |
| Foreground / ink | `#eef1f8` | Primary text. |
| Muted ink | `rgba(238,241,248,.7)` / `.6` / `.5` / `.45` | Captions, secondary labels — pick one per role (§3). |

> **✅ ACCENT — DECIDED: `#6fb7f2`.** The app currently ships `#8bd3ff`; the approved mockups use `#6fb7f2` and that is now locked. **Change the app accent from `#8bd3ff` → `#6fb7f2` everywhere** (token layer + any hardcoded usages). They are not the same blue — grep for `#8bd3ff` and replace.

### Surfaces (the locked "C lightest" card system)
| Surface | Value | Where |
|---|---|---|
| **Small metric tile** (standalone bento gauge) | `rgba(255,255,255,.15–.18)` bg, `.22` border | Standalone 1×1 instrument tiles. The brightest surface. |
| **Large full-width card** | `rgba(255,255,255,.10–.12)` bg | Hero, hourly, storm watch, 7-day. Toned **down** from tile brightness so big surfaces don't glare. |
| **Inset well** (stat box nested inside a card) | `rgba(255,255,255,.055)` | Darker than its parent card, so nested stats read as recessed, not floating. |
| **Section panel** (wraps a group of tiles) | ~5–7% darker than the tiles inside it | Nesting rule: outer panel darker → inner tiles read as elevated. |
| Card border | `rgba(255,255,255,.22)`; hover `.30` | Crisp edge is part of the "premium glass" read. |

### Background (reactive, per condition + time of day)
- Deep navy-blue **dusk** gradient, e.g. partly-cloudy resolves to `#1d3851 → #102031 → #080f1c`. Other condition darks: `#0a1626`, `#08233f`, `#16314f`.
- The per-condition palette lives in `src/domain/weatherCodes.js` (27 conditions + fallback). **The single worst "horrible" factor in the old UI was bright pastel sky behind dark cards** (muddy). All 27 gradients must be the deep Glacier-dusk darks, keeping each condition's hue character.

### Type
- **Inter**, weights 200 / 300 / 400 / 500.
- **Hero temperature: Inter 200, ~84px.** This ultra-thin large number is the primary "premium" lever — do not bump the weight.
- **One type size per role** across the whole UI: label (uppercase, `.12em` tracking), value, caption. Tight line-heights on big numbers. This is the literal fix for the "spacing and font is all off" complaint.

### Legibility floor — WCAG AA (non-negotiable, applies to every component)
The app is for a real daily user (Jenna's husband) who reads it at a glance, often on a phone, sometimes outdoors. **Build hierarchy with size and weight, never by dimming text into low contrast.** Quiet ≠ illegible.

| Role | Size | Color | Why |
|---|---|---|---|
| Quiet label (uppercase) | **≥ 11px**, weight 500 | white **@ ≥ 66%** (`rgba(238,241,248,.66)`), never below ~62% | clears the 4.5:1 AA floor for small text |
| Value you read | 14–15px, weight 500 | full white `#eef1f8` | the glance target (~12:1) |
| Unit / qualifier | 11px, weight 400 | white @ ~66%, set adjacent to its value | "988 hPa" reads as one unit |
| Secondary line | 12.5px, weight 300 | white @ ~68%, line-height ≥ 1.4 | readable supporting text |

**Hard rules:** nothing below **11px** anywhere. All text meets **WCAG AA = 4.5:1** against its actual composited background (measure muted/translucent colors over the real card surface, not over pure black). The current design's faint labels (~`.45–.5` white at 9.5–10px) measured **3.6–4.4:1 and fail/borderline** — that is the bug this floor fixes. Rain-priority values (rain %, dew point, the precip/nowcast curves, condition words) stay the largest, whitest, highest-contrast elements on each card.

---

## 2 · Global layout & stacking order

From `aura_full_dashboard_glacier_assembled`. Top to bottom:

**Jenna's locked top-to-bottom order:**

1. **Header** — brand + location pill (with search) + °F/°C toggle + settings *(structural bookend)*
2. **Severe storm watch** — the severe-alert banner (§3.2); amber/red, **collapses to nothing when no active alert**, so on a calm day the hero is effectively first
3. Group label **"Current conditions"** → **Animated reactive hero** (§3.3) — now the **longer** hero with **UV + sunrise/sunset/daylight** surfaced inline
4. Group label **"Hourly forecast"** → **Hourly module** (§3.4) — the 3-view interactive, scrollable, touch module (Temp & Rain · Precipitation · Wind)
5. Group label **"Atmosphere"** → **Bento gauges** (§3.7) — the enriched instrument panel
6. Group label **"Nowcast"** → **Nowcast** (§3.5) — the 15-minute rain-guidance card
7. Group label **"Rain outlook"** → **Rain outlook** (§3.5) — near-term rain timing + 12/24/48h totals
8. Group label **"Storm watch"** → **Storm watch** (§3.6) — slimmed risk *synthesis* (verdict + CAPE + why-line, not a metrics panel)
9. Group label **"Week ahead"** → **7-day forecast** (§3.8)
10. **Data-trust footer** — timezone · coords · sources (Open-Meteo + NOAA/NWS) · updated time *(structural bookend)*

> **Two distinct storm surfaces (not a duplicate):** #2 **Severe storm watch** is the *conditional alert banner* (§3.2) that appears only when there's an active NWS watch/warning; #8 **Storm watch** is the *always-on risk synthesis card* (§3.6). Different jobs, different positions.

> **⚠ Environmental Exposure section is RETIRED.** The standalone AQI + UV cards are removed. AQI lives in the Atmosphere bento (§3.7); **UV + sunrise/sunset are surfaced in the hero** (§3.3, glance) with the full graded UV gauge + long sun arc remaining in the bento (§3.7, detail). There is no separate Environmental Exposure or Sun & UV section.

**Group labels:** small uppercase, **3px Glacier-blue leading tick**, ~22px top margin for vertical rhythm.
**Global spacing rhythm:** 12px between cards, 8px between wells, 16px card padding, even gutters throughout.

---

## 3 · Component specs

Each component lists its **reference mockup**, **requirements**, and **binary acceptance criteria**. Build the component, screenshot it, open the reference mockup beside it, and confirm every criterion. If a criterion fails, it is not done.

### 3.1 Header
- **Ref:** `aura_full_dashboard_glacier_assembled` (top).
- Brand mark left; location pill (tappable, opens search) center/left; °F/°C segmented toggle; settings icon right.
- **Accept:** ☐ Glacier accent on the active °F/°C segment · ☐ location pill is a single rounded glass pill · ☐ matches mockup spacing/weights.

### 3.2 Severe-alert banner
- **Ref:** `aura_glacier_reactive_hero_alerts_storm` + assembled.
- Full-width banner **above** the hero, color-coded by severity (amber example: "Severe thunderstorm watch · until 10 PM CDT"). Tapping expands detail into the existing `AlertsCard`.
- **Honest empty state:** when there are no alerts (or alerts aren't supported for that location), it collapses to **nothing** — no fake "all clear" card occupying space. (Trust contract.)
- **Accept:** ☐ amber severity styling matches mockup · ☐ collapses fully when no data · ☐ expands to `AlertsCard` · ☐ does not fabricate severity.

### 3.3 Animated reactive hero  ⭐ (a #81 miss — build in full)
- **Ref:** `aura_hero_long_glacier` (canonical — the **longer** hero with UV + sun built in) + `aura_animated_reactive_hero` (reactive-sky reference) + `aura_hero_plus_hourly_curve`.
- **Three layers, all from existing data:**
  1. **Reactive sky** behind the hero — breathing light gradient + slow pulsing **sun-glow** haloing the condition icon + **two cloud layers drifting at different speeds** (parallax). Time-of-day shifts palette + sun/moon position (dawn / day / golden-hour / dusk / night; night = moon + faint stars). Condition picks elements (clear→sun/moon, cloudy→clouds, rain→drifting streaks, snow→falling flakes, fog→haze). Hook into the dormant `data-sunlight-phase` on the hero.
  2. **Condition scene** (sun/cloud/rain/fog) — static fallback under `prefers-reduced-motion`.
  3. **Characteristic descriptor chips**, auto-derived from comfort (dewpoint) / wind / AQI / UV domain logic — e.g. "Muggy · Light breeze · Air good · UV low". **Each chip is omitted when its reading is missing** (trust contract).
- Hero content: ultra-thin 84px temp · condition · feels-like · H/L · narrative one-liner · "High confidence · updated 2 min ago" trust pill · "3° warmer than this morning" diff. Wells inside the hero use the cool Glacier-blue frosted-glass tint (not dark navy).
- **Longer hero — built-in UV + sun (Jenna's explicit ask):** below the core readout, on frosted-glass panels — a **UV index panel** (protection guidance line · "Peak UV 7.5" · 0–11+ gradient scale Low→Extreme with the marker at today's peak) and **Sunrise / Sunset / Daylight** tiles (e.g. 5:16 AM · 8:27 PM · 15h 11m). These are glanceable; the full graded UV gauge + long sun arc remain in the bento (§3.7). Each is omitted when its reading is missing (trust contract).
- **`prefers-reduced-motion: reduce` disables ALL motion** → static fallback.
- **Accept:** ☐ sky animates (breathing + sun-glow pulse + 2 parallax cloud layers) · ☐ chips are data-derived AND drop out individually when data missing · ☐ 84px Inter-200 temp · ☐ longer hero shows UV index panel + sunrise/sunset/daylight · ☐ UV/sun omit cleanly when missing · ☐ reduced-motion kills all animation · ☐ side-by-side matches mockup.

### 3.4 Hourly module — 3 views, scrollable, touch  ⭐ (rebuilt this session — now interactive)
- **Ref:** `aura_hourly_module_glacier` (canonical — the live interactive module) + `aura_hourly_wind_bars` + `aura_hourly_precip_bars`.
- **One card, three tabs** in a segmented control — **Temp & Rain · Precipitation · Wind** — sharing the same chrome (header + tabs + legend + scrollable plot + axis + summary + selected-hour detail + pill strip). Toggling swaps the chart, legend, summary, detail, and pills; **the selected hour persists across tabs**.
- **Temp & Rain (default) — combo.** Amber temperature **line** with circular **node dots** drawn over **rain-chance bars**; bar color encodes intensity (dim < 30% · glacier 30–50% · **green ≥ 50% = rain likely**). One chart answers "jacket *and* umbrella?".
- **Precipitation — bars.** Rain-chance bars solo with a dashed **"50% · likely" threshold line**; sub-30% bars **dimmed** so the rain window pops.
- **Wind — bars.** Speed bars (height = sustained mph) with a **lighter translucent gust extension + bright gust cap**; the **mph value is printed above every bar** (Jenna's ask — speed is readable straight off the graph, no tap needed); a **direction arrow on every hour**, rotated to the wind's true bearing.
- **Full day, horizontally scrollable.** All **24 hours** at a fixed ~44px-per-hour column, so the day is wider than the card — roughly **12–13 hours visible at once on desktop, ~7–8 on a phone** — and you **swipe** for the rest. All 24 hour labels show; gentle scroll-snap settles on hours; momentum scroll on touch; scrollbar hidden. *(Scrolling replaces cramming — this is how 24h stays legible.)*
- **Touch + interaction (coded, not static).** **Tap any hour** — the whole column is the target, not the thin bar — to select it: highlight + node dot + detail line + the matching pill all update. Tap to switch tabs. `touch-action: manipulation` (no 300 ms delay, no accidental double-tap zoom). The **pill strip below scrolls in step with the chart** (proportional sync, both directions). Responsive **≤ 430px** breakpoint; tap targets ≥ 44px.
- **Selected-hour detail line** gives the full read per view — e.g. "1 AM · 67° · 58% rain · showers likely" / "1 AM · 16 mph · gusts 24 · from SW".
- **Data-driven** from six arrays (`temps`, `rainPct`, `windSpd`, `windGust`, `windDir`, `labels`) → wiring to the live API is a straight swap, no layout surgery. **Inline-SVG only.**
- **Per-hour condition icons are dropped** in these clean views; condition shows in the selected-hour detail. *(If wanted back: a sparse inline-SVG icon row on major ticks — never the icon font, which rendered nothing standalone.)*
- **Accept:** ☐ three tabs (Temp & Rain combo · Precipitation · Wind) share one chrome · ☐ Temp & Rain = line + node dots over intensity-colored bars (green ≥ 50%) · ☐ Precip = bars + 50% threshold + dimmed low bars · ☐ Wind = bars + gust cap + **mph value on every bar** + direction arrows · ☐ chart scrolls all 24h with labels + snap · ☐ **tap any hour selects it** (column-wide target) → detail + dot + pill update · ☐ pill strip stays scroll-synced with the chart · ☐ touch-action manipulation + ≤430px responsive + ≥44px targets · ☐ selected hour persists across tabs · ☐ inline-SVG only · ☐ all text ≥ 11px / AA · ☐ matches `aura_hourly_module_glacier`.

### 3.5 Near-term outlook — Rain outlook + Nowcast
- **Ref:** `aura_near_term_outlook_glacier` (row layout) + `aura_nowcast_card` (**v2**, the Nowcast detail).
- **Two cards, balanced `1fr 1fr` columns** (was `1.15fr 1fr` — the lighter Nowcast looked starved next to the dense Rain outlook), `align-items:stretch` so both fill the row height. The old "Hourly Temperature" card folds into the hero hourly card's Temperature metric — no duplication.
- **Nowcast fills its height — no stranded sparkline.** The card is a flex column with the chart block `flex:1`, so it grows to absorb the height the row gives it. The thin floating line becomes a real **15-minute rain-guidance area chart**: smooth curve, green gradient fill, a dashed "rain likely" threshold line near the top, and time ticks (Now · 30m · 1h · 90m · 2h). In a dry window the curve hugs the floor well below the threshold (instantly reads "nowhere near rain"); headline + DRY-WINDOW pill anchor the top, START/DURATION/PEAK wells anchor the bottom.
- **Spacing / type:** even gutters (12 between cards / 8 between wells / 16 padding); nested stat boxes are **darker inset wells (~.055)** inside the .12 card; all labels meet the §1 legibility floor (≥11px, ≥66% white).
- Keep all info: Rain outlook (observed today / projected 24h / peak timing / 12-24-48h totals / rain-signal bar chart / plain-English summary); Nowcast (honest "—" start when dry / duration / peak).
- **Accept:** ☐ balanced `1fr 1fr`, both cards same height · ☐ Nowcast chart fills height (flex), no stranded line · ☐ 15-min guidance chart with threshold + ticks · ☐ inset wells darker than card · ☐ dry-state shows "—"/"Low", never a fake % · ☐ all text ≥ 11px / AA · ☐ matches `aura_nowcast_card` (v2).

### 3.6 Storm watch → risk *synthesis* (slimmed — no longer a metrics panel)
- **Ref:** `aura_storm_watch` (the risk-synthesis version) + assembled ("Risk signals" group).
- **Why slimmed:** the old 4-column panel (storm risk · pressure · wind · comfort) duplicated three tiles that now live in the Atmosphere bento (Pressure, Wind, Dew-point). Storm watch keeps **only what's unique to it** and becomes the *verdict*, not a second set of gauges.
- **Build — keep exactly these:**
  - **Storm risk level** — "Moderate", Level 2 of 4, with the 4-segment indicator (amber).
  - **CAPE** — the convective-energy "storm fuel" reading (e.g. 1130 J/kg) with a Calm→Explosive scale. CAPE appears **only here**.
  - **Peak window** — timing pill tying to the rain peak (e.g. "10 PM–1 AM").
  - **Plain-English why-line** — a synthesis that *names* the drivers (falling pressure + muggy dew point + light shear) **without re-rendering their gauges**. Naming a driver in prose is synthesis; drawing its gauge again is duplication.
- **Do NOT** render standalone Pressure / Wind / Dew-point / Comfort gauges here — they are in the bento (§3.7).
- **Accept:** ☐ shows risk level + dots + CAPE + timing + why-line · ☐ **no** Pressure/Wind/Dew-point gauges (those only in bento) · ☐ why-line names drivers in prose only · ☐ all text ≥ 11px / AA · ☐ matches `aura_storm_watch`.

### 3.7 Atmosphere bento — the enriched instrument panel (full-detail home for AQI · UV · sun)
- **Ref:** `aura_bento_metric_grid_glacier` (the **v3 enriched** version).
- **This section replaces the former Environmental Exposure cards.** AQI + UV live here now, at full detail — there is no separate exposure section.
- **Glance vs detail (UV + sun):** UV + sunrise/sunset are *also* surfaced as a quick glance in the hero (§3.3). The bento stays the **full-detail** home — the graded UV gauge + the long sun arc live here. *(If Jenna prefers zero overlap: trim UV + Sun out of the bento → 6 air metrics, hero becomes the sole home — see §5 open item.)*
- **9 metrics, each a detailed instrument** (not a bare gauge): label + icon + **qualifier pill** (semantic color) + value + **labeled min→max scale where it adds meaning** + a **plain-English caption** that says what the number *means*. The caption is the upgrade that made the panel feel "high-tech" — keep it on every tile.
  - **Air quality** — gauge, AQI value, 0–500 scale, "Good" pill, caption. **Shows the honest missing-data state when AQI is unavailable** (dashed border, hollow gauge, "—", "Not reported here") — the trust-contract showcase now lives on this tile.
  - **UV index** — gauge, 0–11+ color-graded scale, severity pill (e.g. "Very high"), caption with burn-risk guidance.
  - **Humidity** (0–100%), **Pressure** (falling/rising arrow + range), **Visibility** (0–10+ mi) — gauge + scale + caption.
  - **Wind** — compass + speed/gusts + caption.  **Dew point · comfort** — full-width; dry→muggy gradient bar + caption.
  - **Sun** — full-width, **long arc** spanning the card, sunrise/sunset at the ends + caption.  **Moon** — full-width, **on the bottom**; phase + % illuminated + rise/set caption.
- **Layout:** 2-up grid of compact gauge tiles (AQI·UV, Humidity·Pressure, Visibility·Wind), then three full-width cards — **Dew point, Sun, Moon** — stacked at the bottom (Moon last). One shared "instrument kit": thin 7px rounded gauge arcs, one compass, one sun arc, one comfort bar; semantic color per metric. **Inline SVG only** (no icon font).
- **Accept:** ☐ AQI + UV present here (and Environmental Exposure section removed) · ☐ every tile has qualifier pill + caption · ☐ scales on Humidity/Pressure/Visibility/AQI/UV · ☐ Sun full-width long arc · ☐ Moon full-width on bottom · ☐ AQI missing-state on its tile · ☐ inline-SVG icons · ☐ no duplication with Storm watch (synthesis only) · ☐ all text ≥ 11px / AA · ☐ matches `aura_bento_metric_grid_glacier` (v3).

### 3.8 Seven-day forecast — Details pill + drawer + mini hourly  ⭐ (drawer mini-hourly was a #81 miss)
- **Ref:** `aura_7day_with_mini_hourly_drawer` (canonical) + `aura_7day_forecast_glacier_expandable`.
- Per-day row: day name · condition label · signal badge (Warm peak / Steady / Cool dip / Rain watch) · weather icon · High/Low · **temp range bar** positioned across the week's min→max span (cool→warm gradient) · rain-chance pill (honest "Low" instead of a fake % on dry days) · expandable drawer.
- Header: "7-day forecast" + "Upcoming week" tag + trend subtitle ("Cooling trend · 54° to 84° · Wed peaks at 82% rain chance").
- **Expand affordance:** replace the bare chevron with an **obvious accent-outlined "Details" pill** that flips to **"Hide"** + rotating chevron. (Jenna's explicit ask — she didn't know the chevron expanded rows.) Whole row stays the toggle; aria intact. **Today** open by default, marked with a soft Glacier-blue accent border.
- **Drawer content:** (1) one-line "why this matters" sentence; (2) **mini per-day hourly temperature curve** — reuses the flowing-curve hourly component scoped to that day's 24h, shows that day's H/L and 6a→12a ticks, generated per-day from hourly data so each day has its own shape; (3) key stats grid (feels-like, wind, humidity, UV/precip).
- **Accept:** ☐ visible "Details/Hide" pill (not a bare chevron) · ☐ range bars span the week min→max · ☐ dry days show "Low" not fake % · ☐ drawer shows why-line + per-day mini hourly curve + stats · ☐ Today open by default with accent border · ☐ matches mockup.

### 3.9 Data-trust footer
- **Ref:** assembled (bottom).
- Timezone · coords · sources (Open-Meteo + NOAA/NWS) · updated time.
- **Accept:** ☐ all four present · ☐ Glacier styling · ☐ matches mockup.

---

## 4 · Motion & accessibility (non-negotiable)
- Every animation (hero sky, sun-glow, clouds, sparklines) MUST be gated by `@media (prefers-reduced-motion: reduce)` → static fallback.
- The **missing-data trust contract is preserved everywhere**: nothing fabricates a reading. Missing → honest "—" / "Unavailable" / "Not reported here" / dropped chip / collapsed banner. Verify `trust-contract-desktop.png` and `trust-contract-mobile.png` still pass on the dark theme.
- **Type legibility meets WCAG AA (§1 floor):** every label/value/caption is ≥ 11px and ≥ 4.5:1 against its real composited background. No text dimmed below the floor for the sake of hierarchy.
- Keep existing ARIA on expandable rows, toggles, and the location search. Don't regress keyboard access.

---

## 5 · Decisions — ✅ RESOLVED
1. **Atmosphere / Exposure / Storm watch — resolved as one structure (no duplicates):**
   - **Atmosphere bento = BUILD, enriched.** 9 metrics, each with qualifier pill + scale + plain-English caption.
   - **Environmental Exposure section = RETIRED.** AQI + UV move into the bento at full detail; the bento now does everything those cards did. One home, no dupes.
   - **Storm watch = SLIMMED to a risk synthesis.** Keeps only storm-risk level + CAPE + timing + a why-line; drops the Pressure/Wind/Dew-point gauges (those are in the bento). Verdict, not a second gauge set.
2. **Accent:** **`#6fb7f2`.** Locked everywhere; change the app's `#8bd3ff` → `#6fb7f2` (§1).
3. **Hourly = interactive 3-view module (rebuilt this session).** Temp & Rain (combo: temp line + node dots over intensity-colored rain bars) · Precipitation · Wind, in one tabbed card. **24-hour horizontally scrollable** chart, **tap any hour to select**, wind **mph labels on every bar**, pill strip **scroll-synced** to the chart, fully touch-coded + responsive. Canonical mockup: `aura_hourly_module_glacier`.
4. **Hero = longer, with UV + sun built in.** The reactive hero gains a **UV index panel + sunrise/sunset/daylight** inline (Jenna's explicit ask). Canonical mockup: `aura_hero_long_glacier`.
5. **Section / stacking order (Jenna's locked order, §2):** Severe storm watch → Hero → Hourly → Atmosphere → Nowcast → Rain outlook → Storm watch → Week ahead (Header + Data-trust footer as structural bookends). The two storm surfaces are distinct: conditional alert banner (§3.2) vs always-on risk synthesis (§3.6).

**Open — shipped on assumed defaults (override in one line):**
- **UV / Sun overlap.** Default: **glance in hero (§3.3) + full detail in bento (§3.7)**. Alt: trim UV + Sun from the bento → 6 air metrics, hero sole home.
- **Rain outlook vs Nowcast.** Default: **two distinct near-term cards** (§3.5), sequenced Nowcast → Rain outlook per §2. Alt: merge into one.

Echo the resolved decisions at the top of the implementing PR so the choices are on the record.

---

## 6 · Verification protocol (the anti-drift gate)
1. **Per-component visual diff.** For each component in §3: build it → `npm run screenshots` (the preview MCP **hangs** on this app's particle rAF loop; use `npm run screenshots` — builds + Playwright preview, writes `docs/screenshots/*.png` in ~1.3 min — then read the PNGs) → open the matching mockup in `docs/redesign/glacier/mockups/` → confirm **every** acceptance checkbox.
2. **Tests + lint.** Existing suite green (the prior real build ran 466 unit + 168 render tests) + lint clean. Re-record visual-regression baselines on Linux/CI only after Jenna approves the look (dispatch `quality-gates.yml`), never hand-rolled.
3. **Legibility check (§1 floor).** For each component, confirm no text is below 11px and every muted/translucent color clears 4.5:1 against its actual card surface (compute the composite — translucent white over the glass tile, not over black). Faint labels like CAPE / hPa / DEWPOINT are the usual offenders.
3. **Live preview + sign-off.** Push branch → open PR → **Netlify deploy preview** renders the whole thing animating. **Jenna reviews the live preview and signs off. No merge, and no "done," before that.** Auto-merge stays off.
4. **No self-certification.** Filling §7 is mandatory and every box needs evidence (which PNG, which test run). An unfilled or hand-waved checklist = not done.

---

## 7 · Acceptance checklist (paste into the PR; ALL boxes, with evidence)

**Tokens & global**
- ☐ Glacier `#6fb7f2` accent applied (or §5.2 decision recorded) — evidence: ____
- ☐ Card system: tiles .15–.18 / large cards .10–.12 / wells .055 / panels darker — evidence: ____
- ☐ All 27 `weatherCodes.js` condition gradients are deep Glacier-dusk darks — evidence: ____
- ☐ Hero temp Inter-200 ~84px; one type size per role globally — evidence: ____
- ☐ Stacking order + group labels (3px Glacier tick) match §2 — evidence: ____

**Components (each = matches its mockup, §3)**
- ☐ Header · ☐ Alert banner (collapses when empty) · ☐ **Animated reactive hero — longer; 3 layers + data chips + UV/sun panel** · ☐ **Hourly module — 3 tabs (Temp & Rain combo · Precipitation · Wind), 24h scroll, tap-to-select, mph on wind bars, scroll-synced pills** · ☐ Near-term outlook (2 cards, spacing fixed) · ☐ **Storm watch (risk synthesis — verdict + CAPE + why-line, no duplicate gauges)** · ☐ **Atmosphere bento (enriched 9-metric, AQI + UV here, captions + scales, Sun/Moon full-width, AQI missing-state)** · ☐ **Environmental Exposure section removed** · ☐ **7-day: Details pill + drawer + per-day mini hourly** · ☐ Trust footer
- evidence PNGs: ____

**Integrity**
- ☐ All motion gated by `prefers-reduced-motion` — evidence: ____
- ☐ Missing-data trust contract intact (trust-contract PNGs pass) — evidence: ____
- ☐ Type legibility: nothing < 11px, all text ≥ AA 4.5:1 on its real background (§1 floor) — evidence: ____
- ☐ ARIA / keyboard not regressed — evidence: ____
- ☐ Lint clean + full test suite green — evidence: ____

**Sign-off**
- ☐ Resolved decisions echoed at top of PR: bento = **build**, accent = **`#6fb7f2`**, **hourly = interactive 3-view module**, **longer hero w/ UV + sun**, **§2 stacking order** (§5)
- ☐ Netlify preview link in PR
- ☐ **Jenna signed off on the live preview** ← required before merge

---

*The mockups are the contract. If you can't point to the mockup, don't build it. If you skipped a mockup, say so out loud — don't decide it for her.*
