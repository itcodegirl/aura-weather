# Instrument — direction brief

**Status: step 1 of five is open as a draft PR. Nothing else is authorised.**

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

| Role | Value | Contrast vs panel |
|---|---|---|
| `ground` | `#f1f4f8` | — |
| `panel` | `#ffffff` | 1.10 vs ground |
| `wire-structural` | `#8a909e` | **3.20** |
| `wire-rhythm` | `#e2e6ec` | 1.25 |
| `ink` | `#0d1420` | **18.45** |
| `ink-dim` | `#55637a` | **6.08** |
| `status-ok` | `#0a7551` | 5.71 |
| `status-warn` | `#8a5300` | 6.33 |
| `status-crit` | `#b4302a` | 6.18 |
| `status-accent` | `#1a63a8` | 6.19 |

The two wire weights are not a stylistic choice. A single wire at the
weight that reads as "quiet" measured 1.23:1 against the panel, and the
panel 1.04:1 against the ground — which means the module boundaries would
have been effectively invisible, failing WCAG 1.4.11 (3:1 for non-text
information). `wire-structural` carries the boundary and clears 3:1;
`wire-rhythm` is decorative pacing inside a module and has no floor.

## The sequence

| Step | What | State |
|---|---|---|
| 1 | Semantic token layer holding today's colours, zero visual change | **Open — draft PR, `chore/semantic-tokens`** |
| 2 | Opaque surfaces; drop `backdrop-filter` | not authorised |
| 3 | The Instrument palette proper | not authorised |
| 4 | Light palette, `prefers-color-scheme`, `color-scheme: light dark` | not authorised |
| 5 | Contrast-budget test covering both themes | not authorised |

Each step is its own PR and needs Jenna's go-ahead before it starts.
Per `AGENTS.md`, subjective visual decisions are not an agent's to make;
these steps are written down so they can be approved or rejected one at a
time, not so they can be worked through unprompted.

## What step 4 runs into

`index.html:17` declares `<meta name="color-scheme" content="dark only" />`,
with this rationale beside it:

> Aura is dark-only by design: cards are frosted surfaces engineered to
> sit on a colourful weather-scene gradient. Half-light support (light
> body, dark cards) read as a UI bug per the design audit.

That is not stale — it describes the app as it is today. A light theme
means that comment stops being true, which is exactly why step 2 (opaque
surfaces) comes before step 4: the reason light mode read as a bug was the
frosted glass, and the direction removes it. Step 4 changes the meta tag;
until then it stands.

There is no `prefers-color-scheme` query anywhere in `src/` or
`index.html` today. `theme-color` is `#0b1c3f` and will need to move with
the palette.

## The one thing an agent should not decide

The weather-scene gradient's light derivation. The dark gradient is the
app's signature and the light version of it is a judgment call about what
Aura looks like, not a contrast calculation. It needs Jenna's eye before
anyone writes a value.
