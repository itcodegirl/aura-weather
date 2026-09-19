# Instrument — direction brief

**Status: steps 1–3 are merged; step 4 (with step 5 folded in) is open as a draft PR. Step 3 shipped the palette only — see "What step 3 did not cover".**

A working note, not a plan of record. It exists so this direction survives
a context change with its constraints and its corrections intact, because
the corrections are the part that keeps getting lost.

## What Jenna asked for

A more modern, more technical presentation of the data **in the layout she
already has**. Not a restructure.

Three constraints, all of them stated after an earlier proposal got them
wrong:

1. **Keep the block layout.** An earlier round proposed one 24-hour
   surface carrying temperature, rain probability, wind and gust, a UV
   band, alert extents and sun events in a single coordinate space. That
   was never the ask. The bento stack stays.
2. **Keep the data.** Nothing currently tracked is dropped to make a
   layout tidier. Consolidating a block or two is on the table; losing a
   metric is not.
3. **Draw the real blocks.** Mockups that stand in for the dashboard
   rather than reproducing it are worse than useless — see
   `captures/README.md` for what went missing the first time, and open
   the captures before proposing anything.

Two specific things were asked about by name and both stay: the forecast's
week control (`UPCOMING WEEK`, visible in `captures/08-forecast.jpg`) and
the radar block.

## The direction

**Instrument**, in both themes — dark and light.

Chosen from three candidates (Instrument, Blueprint, Aurora). The idea is
a measuring instrument rather than a weather illustration: flat opaque
panels instead of frosted glass, a drawn wire grid that separates modules,
and colour reserved for status so a coloured pixel always means something.

The palettes below were measured rather than eyeballed. Every ratio is
computed from the two hexes beside it, so any of them can be rechecked
without trusting this table.

### Dark

| Role | Value | Contrast vs panel |
|---|---|---|
| `ground` | `#070a10` | — |
| `panel` | `#0b1118` | 1.04 vs ground |
| `wire-structural` | `#58616e` | **3.02** |
| `wire-rhythm` | `#1b2536` | 1.23 |
| `ink` | `#d9e2ee` | **14.50** |
| `ink-dim` | `#8b9bb1` | **6.70** |
| `status-ok` | `#37d19f` | 9.74 |
| `status-warn` | `#ffb347` | 10.65 |
| `status-crit` | `#ff6b60` | 6.79 |
| `status-accent` | `#6fb7f2` | 8.79 |

### Light

Revised 2026-09-19 (Jenna): the panel is **not** white. The original
table had `panel #ffffff` on `ground #f1f4f8`, and its `wire-structural
#8a909e` measured **2.98** against the panel Jenna moved to and **2.90**
against the table's own ground — under 3:1 both ways. The wire darkened
to `#7b8292`. Every ratio below is re-measured against the new panel;
the raised tile is the brief's original white, one tier up; the well is
the ground, as in dark.

| Role | Value | vs panel `#f5f7fa` | vs ground `#e4e9ef` |
|---|---|---|---|
| `ground` | `#e4e9ef` | 1.14 | — |
| `panel` | `#f5f7fa` | — | 1.14 |
| `panel-raised` | `#ffffff` | 1.07 | 1.21 |
| `panel-well` | `#e4e9ef` | 1.14 | — |
| `wire-structural` | `#7b8292` | **3.59** | **3.16** |
| `wire-rhythm` | `#e2e6ec` | 1.17 | 1.03 |
| `ink` | `#0d1420` | **17.19** | 15.11 |
| `ink-muted` | `#313c4d` | 10.39 | 9.13 |
| `ink-dim` | `#55637a` | **5.67** | 4.98 |
| `status-ok` | `#0a7551` | 5.32 | 4.68 |
| `status-warn` | `#8a5300` | 5.90 | 5.18 |
| `status-crit` | `#b4302a` | 5.76 | 5.06 |
| `status-accent` | `#1a63a8` | 5.77 | 5.07 |

The two wire weights are not a stylistic choice. A single wire at the
weight that reads as "quiet" measured 1.23:1 against the panel, and the
panel 1.04:1 against the ground — which means the module boundaries would
have been effectively invisible, failing WCAG 1.4.11 (3:1 for non-text
information). `wire-structural` carries the boundary and clears 3:1;
`wire-rhythm` is decorative pacing inside a module and has no floor.

## The sequence

| Step | What | State |
|---|---|---|
| 1 | Semantic token layer holding today's colours, zero visual change | **Merged — PR #239** |
| 2 | Opaque surfaces; drop `backdrop-filter` | **Merged — PR #242.** |
| 3 | The Instrument palette proper | **Merged — PR #243.** The dark table into the roles, plus the component surface sweep. **Palette only** — the mockup's step 3 also names mono numerals, module headers, status words instead of badges, and rule-divided data grids; those are open as **3b** (below). |
| 4 | Light palette, `prefers-color-scheme`, `color-scheme: light dark` | **Merged — PR #244.** System-following only; no sky in light (flat ground); the light table revised as above; the unnamed families derived (appendix). |
| 5 | Contrast-budget test covering both themes | **Folded into step 4.** Ink on every surface, wire vs panel *and* ground, status on panel — both schemes — plus light severity text on its own tint. |
| 3b-i | Flat square chrome, and the mono face | **Open — draft PR.** See below. |

Each step is its own PR and needs Jenna's go-ahead before it starts.
Per `AGENTS.md`, subjective visual decisions are not an agent's to make;
these steps are written down so they can be approved or rejected one at a
time, not so they can be worked through unprompted.

## What step 4 did

`index.html` now declares `color-scheme: light dark` with a rewritten
rationale, and `theme-color` per scheme (`#070a10` dark, `#e4e9ef`
light). The light block is a second `:root` under
`@media (prefers-color-scheme: light)` in `App.css`; there is no in-app
toggle (decision: system-following only). The 23 hard-coded light-text
literals in component stylesheets that would have vanished on a pale
panel were mapped to the tokens the light block redefines.

## The one thing an agent should not decide — decided

The weather-scene gradient has **no light derivation**. Jenna's call,
2026-09-19: light mode is a flat ground. `.app` drops its inline sky
under `prefers-color-scheme: light`, and the atmospheric washes are off
there. The dark gradient stays the signature.

## What step 3 did not cover (3b — not authorised)

The mockup this direction was approved from ("Instrument, Both Themes")
lists step 3 as *mono numerals, the two wire weights, module headers,
status words instead of badges*. This brief compressed that to "the
palette", and #243 shipped the palette and the wires. Still open, each a
decision:

1. **Mono numerals and labels** — IBM Plex Mono for every number, unit,
   eyebrow and label. **Shipped in 3b-i.**
2. **Module chrome** — flat, square, no shadow, a structural rule for the
   boundary, and a header row (mono title · scope chip · status word).
   **The flat square part shipped in 3b-i**; the header row is JSX in all
   ten blocks, three of them high-risk files, and is still open.
3. **Status words instead of badges** — the AUD-005 vocabulary stays;
   the pill becomes a coloured mono word, and the alert row loses its
   tinted background. **Open (3b-ii).**
4. **Data grids** — stat tiles become rule-divided cells, `label / value
   / unit`, flat on the ground. The raised tile nearly disappears from
   the system; the rhythm wire does its job. **Open (3b-iii).**

The mockup is a single column; D2 keeps the bento, so "module" means
each block. Sequenced as three PRs: chrome + font, headers + status
words, grids.

## What 3b-i did

**The face.** IBM Plex Mono, three static weights (400/500/600), subset
from the upstream latin files and self-hosted beside Inter —
23 KB for all three against Inter's 48 KB, and Lighthouse did not move
(99/100/100/100). Only Medium is preloaded, because it is the weight the
hero reading paints. The faces are in the offline shell, so a cached
launch keeps its numerals; `sw.js` went to `v6` for that.

The role is narrow on purpose: **measured values and their labels, never
running prose.** In practice that is every rule already declaring
`font-variant-numeric: tabular-nums` (it had already said it was a
numeral) and every rule pairing `text-transform: uppercase` with a
`letter-spacing` (the label idiom). 76 rules, mechanically selected by
those two signals rather than by eye. Card titles and body copy stay
Inter.

Fifty of those rules asked for a weight the subset does not ship — the
hero numeral at 200, labels at 700 — which leaves the result to font
synthesis. They are clamped to the nearest shipped weight, so what the
stylesheet says is what renders. The hero numeral is the one judgment
call, set to 500 because the mockup names that weight for the big
reading; it was Inter 200 before, and it is the most visible single
change in this step.

**The chrome.** The radius ramp is all zeros. The six names stay
separate rather than collapsing to one, so the surface tier a rule
belongs to is still readable and a future direction can put the ramp
back in one place. `--radius-pill` is not in the ramp and still draws
999px: dots, handles and avatar wells are circles, not rectangles.
Thirty-six literal `px` radii that never went through the ramp were
squared too.

Every shadow token is `none`. Instrument carries elevation on the wire —
a module is bounded by a rule clearing 3:1, so a drop shadow under it is
a second boundary saying the same thing less legibly, and the inset
bevel is a light source this direction does not have. The tokens stay
declared because ~40 rules compose from them. A sweep then took the
literal shadows out of 51 rules under one rule: **drop** inset
top-highlight bevels and offset drop shadows; **keep** ring layers
(`0 0 0 Npx`), marker glows, and solid offset bars. That carve-out is
load-bearing — `#main-content:focus-visible` is drawn with
`inset 4px 0 0`, and an earlier pass classified it as a bevel and
deleted the focus indicator.

**The trap.** `box-shadow` takes a comma-separated list, and `none` is
not a legal member of one: `box-shadow: 0 0 0 3px rgba(…), none;` is
discarded whole. Flattening the tokens turned every rule that composed
`var(--shadow-raise-sm)` into a larger list into exactly that — two
rules did, one of them the header's focus ring. There is now a guard
for that shape, alongside guards for the ramp, the shadow values, the
mono stack, and the three faces being declared, present on disk and in
the offline shell.

Marker glows on the charts and the pill shape on badges are deliberately
untouched: they belong to 3b-ii and 3b-iii.

## Light values the table does not name

Derived, not chosen: same hue and saturation as the dark value,
lightness solved so the light value hits the **same ratio against the
light panel** that the dark value hits against the dark panel — for
text. Fills are the exception: at "same ratio" a 12:1 fill is
near-black, and the first light preview showed it. The risk ramp and
chart series ship at **3:1 against the light panel** (WCAG 1.4.11 for
graphical objects) since 2026-09-19; the same-ratio values are kept as
the alternative. The two chart tokens that were also read as text point
their text uses at the amber/green text tints instead (`--amber-soft`,
`--green-good-light`), which are derived for text and sit within a few
steps of the dark values they replace.

| Token | Dark | vs dark panel | Light (shipped) | vs light panel | Alternative |
|---|---|---|---|---|---|
| `--severity-critical-fg` | `#fecaca` | 13.11 | `#5f0202` | 13.11 | |
| `--severity-high-fg` | `#fed7aa` | 14.01 | `#3b2001` | 14.09 | |
| `--severity-warn-fg` | `#fde68a` | 15.22 | `#271f01` | 15.22 | |
| `--severity-ok-fg` | `#bbf7d0` | 15.64 | `#04230f` | 15.56 | |
| `--severity-info-fg` | `#dbeafe` | 15.54 | `#021d41` | 15.61 | |
| `--status-ready-fg` | `#dcfce7` | 17.26 | `#021709` | 17.36 | |
| `--severity-*-border` | rgba, 2.0–2.8 | | `#dda1a3` `#ea9d78` `#e49c4a` `#2bbe6f` `#7d98b6` | 2.0–2.8 | |
| `--severity-*-bg` | rgba, 1.1–1.3 | | `#f4e2e5` `#eedfd9` `#e3dac1` `#dff4f0` `#e5ebf8` | 1.1–1.3 | |
| `--risk-low` | `#22c55e` | 8.32 | **`#1ca54f`** | 3.00 | same-ratio `#0f5428` (8.39) |
| `--risk-moderate` | `#a3e635` | 12.57 | **`#6a9f14`** | 2.99 | same-ratio `#223306` (12.72) |
| `--risk-elevated` | `#eab308` | 9.89 | **`#b38906`** | 3.00 | same-ratio `#4f3c03` (9.84) |
| `--risk-high` | `#f97316` | 6.76 | **`#ef6506`** | 2.99 | same-ratio `#913e04` (6.79) |
| `--risk-severe` | `#ef4444` | 5.04 | **`#f15f5f`** | 2.98 | same-ratio `#d41212` (5.02) |
| `--risk-extreme` | `#a855f7` | 4.79 | **`#b56ff8`** | 2.97 | same-ratio `#9631f5` (4.82) |
| `--chart-rain-top` / `-bottom` | `#7fb6ef` / `#5391d8` | 8.88 / 5.79 | **`#4293e7` / `#5593d9`** | 2.98 / 3.00 | same-ratio `#10467d` / `#2662a7` |
| `--chart-good-top` / `-bottom` | `#9be7b4` / `#5fc88c` | 13.08 / 9.14 | **`#27a450` / `#38a265`** | 3.01 / 3.00 | same-ratio `#0c3218` / `#1b4d30` |
| `--chart-outline` | `#0d1b2e` | 1.10 | `#e6edf8` | 1.09 | |
| `--chart-selected` | `#ffd591` | 13.70 | **`#cb7d00`** | 3.01 | same-ratio `#392300` (13.82) |
| `--surface-1/2/3/strong` | rgba navies, ≈1.0 | | `#f4f6fb` `#f2f5fb` `#f3f6fc` `#f7f9fd` | ≈1.0 | |
| `--paper` / `--paper-dim` | `#f8fbff` / `#edf5ff` | 18.27 / 17.25 | `#000d1e` / `#00142d` | 18.21 / 17.23 | |
| `--accent-strong` | `#4a9fe0` | 6.62 | `#195c90` | 6.58 | |
| `--glacier-mid/light/muted` | `#9cc9f2` `#bcdcfa` `#aecdf2` | 10.9 / 13.3 / 11.6 | `#0d3a62` `#062b4e` `#0f3460` | 10.9 / 13.3 / 11.6 | |
| `--amber-soft` / `--green-good-light` | `#f5cd92` / `#a9e2bd` | 12.67 / 12.91 | `#422a06` / `#11341e` | 12.56 / 12.78 | |
| `--focus-ring` / `--focus-outline` / `--hover-border-color` | accent @ .4 / .8 / .44 | | light accent, same alphas | | |
| `--active-pill-bg` / `-color` | white gradient / `#021127` | 18.34 (text on pill) | `#000b16→#001e43` / `#ffffff` | 18.41 | |
