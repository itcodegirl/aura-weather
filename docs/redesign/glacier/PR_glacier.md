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
- **Atmosphere bento → built** — mixed-span instrument panel; the AQI tile intentionally ships in its missing-data state (trust contract made visible). No duplication of a metric's primary home.

## What changed (per component — each built to its mockup)
- **Header** — brand + location pill + °F/°C + settings, Glacier accent.
- **Severe-alert banner** — amber, collapses to nothing when no alerts.
- **Animated reactive hero** — breathing gradient + pulsing sun-glow + two parallax cloud layers; data-derived comfort/wind/UV chips (each drops out when its reading is missing); ultra-thin 84px temp. Reduced-motion = static.
- **Hourly** — inline-SVG day/night condition icons on a fixed row; flowing curve weaving through value points; frosted chips occlude the line so no digit is ever crossed; gradient fill + glow; metric selector (Precip/Temp/Wind).
- **Near-term outlook** — balanced `1fr 1fr`; Rain outlook + Nowcast; Nowcast chart fills its height (15-min rain-guidance area chart, no stranded sparkline).
- **Storm watch** — restyled compact; warm-amber risk/pressure/comfort cues.
- **Atmosphere bento** — mixed-span gauges, shared instrument kit, AQI missing-data state.
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
- [ ] Header · [ ] Alert banner (collapses empty) · [ ] Animated reactive hero (3 layers + data chips) · [ ] Flowing-curve hourly + metric selector · [ ] Near-term (balanced, Nowcast fills height) · [ ] Storm watch · [ ] Atmosphere bento (mixed spans, AQI missing-state) · [ ] 7-day (Details pill + drawer + mini hourly) · [ ] Trust footer
- evidence PNGs: ____

**Integrity**
- [ ] All motion gated by `prefers-reduced-motion` — evidence: ____
- [ ] Missing-data trust contract intact (trust-contract PNGs pass) — evidence: ____
- [ ] Type legibility: nothing < 11px, all text ≥ AA 4.5:1 on its real background — evidence: ____
- [ ] ARIA / keyboard not regressed — evidence: ____

## Sign-off (required before merge)
- [ ] Resolved decisions echoed above (bento = build, accent = `#6fb7f2`)
- [ ] Netlify preview link included
- [ ] **Jenna reviewed the live preview and approves** ← gate; no merge before this
- Auto-merge stays **off**.

---
*Authored as `itcodegirl`, conventional commits, no Claude attribution. Built to the mockups — every checked box names the evidence.*
