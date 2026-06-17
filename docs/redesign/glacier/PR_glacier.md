# Glacier redesign — PR title & description

Paste this into the **implementation PR** (the build on `claude/glacier-redesign-spec`). Not for the docs commit.

---

## ▶ PR title

```
feat(ui): Glacier redesign — reactive dark-glass dashboard
```

Alternates:
- `feat(ui): Glacier redesign — hero, hourly, near-term, storm, bento, 7-day`
- `feat(aura): Glacier dark-glass redesign (reactive hero + flowing hourly + bento)`

---

## ▶ PR description (paste below the title)

## Summary
Full visual redesign of Aura to the **Glacier** system — a reactive dark-glass dashboard (glassmorphism cards over a condition + time-of-day gradient). Built strictly to the locked mockups in `docs/redesign/glacier/` per `GLACIER_BUILD_SPEC.md`. **Surgical restyle:** all engineering, the data layer, the missing-data trust contract, and accessibility are preserved — surface + the named new pieces only.

**Supersedes and replaces #82** (and the earlier closed #81), which under-scoped the redesign.

## Resolved decisions (on the record)
- **Accent → `#6fb7f2`** — replaced the app's previous `#8bd3ff` everywhere (token layer + hardcoded usages).
- **Atmosphere bento → built (enriched) and Environmental Exposure → retired.** The bento is the single home for AQI + UV: 9 metrics, each with a qualifier pill, labeled scale, and plain-English caption. The AQI tile intentionally ships its honest missing-data state (trust contract made visible). The former standalone Environmental Exposure section is removed.
- **Storm watch → slimmed to a risk synthesis.** Keeps storm-risk level + CAPE + peak window + a why-line that names its drivers in prose; the Pressure/Wind/Dew-point gauges are dropped (they live in the bento). No metric is rendered twice.
- **Hourly → rebuilt as one interactive module.** Three tabs — **Temp & Rain** (combo: temperature line + node dots over intensity-colored rain bars, green ≥ 50% = likely) · **Precipitation** · **Wind** — sharing one card chrome. The chart is a **horizontally scrollable 24-hour** strip (~12–13 hours visible at once, swipe for the rest), every hour is a **tap target** (selection updates highlight + detail + pill), the **wind speed in mph is printed on every bar**, and the pill strip stays **scroll-synced** to the chart. Fully touch-coded (`touch-action: manipulation`, ≥44px targets, ≤430px responsive).
- **Hero → longer, with UV + sun built in.** The reactive hero gains an inline **UV index panel** (Low→Extreme scale, peak marker) + **Sunrise / Sunset / Daylight** tiles (glance), with the full graded UV gauge + long sun arc still in the bento (detail). Reduced-motion → static.
- **Section / stacking order → Jenna's locked order (§2):** Severe storm watch → Hero → Hourly → Atmosphere → Nowcast → Rain outlook → Storm watch → Week ahead.

## What changed (per component — each built to its mockup)
- **Header** — brand + location pill + °F/°C + settings, Glacier accent.
- **Severe-alert banner** — amber, collapses to nothing when no alerts.
- **Animated reactive hero** — **longer** hero: breathing gradient + pulsing sun-glow + two parallax cloud layers; data-derived comfort/wind/UV chips (each drops out when its reading is missing); ultra-thin 84px temp; **inline UV index panel + Sunrise/Sunset/Daylight**. Reduced-motion = static.
- **Hourly module** — one tabbed card, three views: **Temp & Rain** (combo line + node dots over intensity-colored rain bars, green ≥ 50%) · **Precipitation** (bars + 50% threshold, low bars dimmed) · **Wind** (bars + gust cap + **mph value on every bar** + per-hour direction arrows). **24-hour horizontally scrollable** chart with all hour labels + scroll-snap; **tap any hour** to select (column-wide target) → detail + dot + pill update; pill strip **scroll-synced** to the chart; touch-coded + ≤430px responsive. (Per-hour condition icons dropped; condition shows in the selected-hour detail.)
- **Near-term outlook** — balanced `1fr 1fr`; Rain outlook + Nowcast; Nowcast chart fills its height (15-min rain-guidance area chart, no stranded sparkline).
- **Storm watch** — risk synthesis only: storm-risk level + CAPE + peak window + plain-English why-line. No Pressure/Wind/Dew-point gauges (those are in the bento).
- **Atmosphere bento** — enriched 9-metric instrument panel; AQI + UV live here; each tile has a qualifier pill, labeled scale, and plain-English caption; Sun + Moon full-width; AQI missing-data state on its tile.
- **Environmental Exposure section** — removed (its AQI + UV now live in the bento).
- **7-day** — obvious "Details/Hide" pill; range bars across the week min→max; drawer with why-line + per-day mini hourly curve + key stats; Today open by default.
- **Trust footer** — timezone · coords · sources · updated.
- **Theme** — all 27 condition gradients reworked to deep Glacier-dusk darks.

## Out of scope / preserved
- No changes to the data layer, fetching, or domain logic.
- Missing-data trust contract intact (honest "—" / "Unavailable" / collapsed states).
- No new runtime dependencies. ARIA / keyboard behavior preserved.

## Testing & verification
- [ ] Lint clean
- [ ] Unit + render tests green ( __ / __ )
- [ ] Per-component screenshots captured via `npm run screenshots` and diffed against `docs/redesign/glacier/mockups/`
- [ ] Visual-regression baselines re-recorded on CI (not hand-rolled)

## Screenshots / preview
- Netlify deploy preview: __________
- (attach before/after or per-component shots)

## Acceptance checklist — all boxes, **with evidence** (mirrors spec §7)

**Tokens & global**
- [ ] Accent `#6fb7f2` applied; `#8bd3ff` fully removed — evidence: ____
- [ ] Card system: tiles .15–.18 / large cards .10–.12 / wells .055 / panels darker — evidence: ____
- [ ] All 27 `weatherCodes.js` gradients are deep Glacier-dusk darks — evidence: ____
- [ ] Hero temp Inter-200 ~84px; one type size per role — evidence: ____
- [ ] Stacking order + group labels (3px Glacier tick) match §2 — evidence: ____

**Components (each matches its mockup)**
- [ ] Header · [ ] Alert banner (collapses empty) · [ ] Animated reactive hero (longer; 3 layers + data chips + UV/sun panel) · [ ] Hourly module (3 tabs: Temp & Rain combo · Precipitation · Wind; 24h scroll; tap-to-select; mph on wind bars; synced pills) · [ ] Near-term (balanced, Nowcast fills height) · [ ] Storm watch (risk synthesis, no duplicate gauges) · [ ] Atmosphere bento (enriched 9-metric, AQI + UV here, captions + scales, Sun/Moon full-width, AQI missing-state) · [ ] Environmental Exposure section removed · [ ] 7-day (Details pill + drawer + mini hourly) · [ ] Trust footer
- evidence PNGs: ____

**Integrity**
- [ ] All motion gated by `prefers-reduced-motion` — evidence: ____
- [ ] Missing-data trust contract intact (trust-contract PNGs pass) — evidence: ____
- [ ] Type legibility: nothing < 11px, all text ≥ AA 4.5:1 on its real background — evidence: ____
- [ ] ARIA / keyboard not regressed — evidence: ____

## Sign-off (required before merge)
- [ ] Resolved decisions echoed above (bento enriched = build, Environmental Exposure retired, Storm watch = synthesis, accent = `#6fb7f2`, **hourly = interactive 3-view module**, **longer hero w/ UV + sun**, **§2 stacking order**)
- [ ] Netlify preview link included
- [ ] **Jenna reviewed the live preview and approves** ← gate; no merge before this
- Auto-merge stays **off**.

---
*Authored as `itcodegirl`, conventional commits, no Claude attribution. Built to the mockups — every checked box names the evidence.*
