# Screenshots

This folder holds two kinds of trust-contract assets.

Nothing writes into it as a side effect. The capture specs render into
`test-results/captures/<repo-relative-path>` (gitignored), and a separate,
deliberate step copies a set over the tracked files. Before that split, any
`npm run test:e2e` rewrote six tracked PNGs, and the binary churn was
committed by accident more than once.

## Static screenshots (PNG)

Captured by the Playwright specs:

- `e2e/readme-screenshots.spec.js` — real-data dashboard shots
  (`dashboard-desktop.png`, `dashboard-mobile.png`) and the
  alert-overflow shot (`alert-overflow.png`)
- `e2e/trust-contract-screenshot.spec.js` — the `?mock=missing` shots
  (`trust-contract-desktop.png`, `trust-contract-mobile.png`)

The CI workflow uploads the freshly captured set (from
`test-results/captures/`, not from this folder) as an artifact named
`trust-contract-screenshots`.

## Regenerate locally

```bash
npm run screenshots
```

That single command runs the two specs above plus
`e2e/social-pwa-assets.spec.js`, then promotes the result over the five
PNGs in this folder and the `public/` social/PWA captures
(`og-image.png`, `screenshots/aura-narrow.png`, `screenshots/aura-wide.png`).

It is all-or-nothing on purpose: if a capture fails, nothing is promoted,
so a half-updated set never lands in the tree.

## Promote a set captured elsewhere

Local environments cannot reach the CARTO basemap tiles, so the two
dashboard shots can only be captured for real in CI. To install a set from
there, download the `trust-contract-screenshots` artifact, unzip it into
`test-results/captures/`, and run:

```bash
node scripts/promote-captures.mjs
```

The artifact's internal paths mirror their repo locations, so the unzip
lands each file where the promote step expects it.

## Files produced

| File | Viewport | What it shows |
| --- | --- | --- |
| `dashboard-desktop.png` | 1366×900 | Full dashboard with real-data mocks, frozen at 2026-04-21T12:00 CDT |
| `dashboard-mobile.png` | 390×844 | Mobile stacked layout with the same frozen forecast |
| `alert-overflow.png` | 1366×900 (cropped to AlertsCard) | 6 active NWS alerts so the `+N more` overflow chip is visible |
| `trust-contract-desktop.png` | 1366×900 | `?mock=missing` desktop — muted `—` placeholders with "No data available" cues, the "— means the provider didn't report that reading. It isn't a zero." footnote, and the "Radar not queried in this demo" card |
| `trust-contract-mobile.png` | 390×844 | `?mock=missing` mobile |

## Notes

- Time is frozen to `2026-04-21T12:00:00-05:00` (matches the visual
  regression baseline, now removed) so run-to-run variation is minimised.
  They are not byte-stable: sub-pixel rasterisation still moves a small
  number of pixels between runs.
- Animations and transitions are disabled and the font is pinned to
  Arial so images stay stable across machines.
- The trust-contract captures no longer need any external tile host:
  `?mock=missing` mounts no map at all — the radar slot holds the
  "Radar not queried in this demo" card. The dashboard captures do
  still reach the live CARTO basemap tiles (RainViewer's catalogue and
  radar tiles are mocked, the basemap is not), so an environment that
  cannot reach the tile hosts renders the radar as a blank rectangle.
  That is why regeneration runs in CI, where the hosts are reachable.
- The PNGs are committed so the project README renders a visual-first
  portfolio pass on GitHub, but they should still be regenerated
  whenever the UI changes materially — preferably via the CI workflow
  below.
- `scripts/capture-isolation.test.mjs` fails the build if a capture spec is
  ever re-pointed at a tracked directory, since that regression would
  otherwise surface only as mystery churn in someone else's pull request.

## Refresh from CI

The `Refresh Screenshots` workflow
(`.github/workflows/refresh-screenshots.yml`) regenerates every
committed capture on a runner that can reach the basemap tile hosts.
Trigger it manually from the Actions tab ("Run workflow") on the
branch that should receive the refresh: it runs `npm run screenshots`
(build + all three capture specs, covering `docs/screenshots/*.png`
plus the `public/` og-image and manifest install shots) and, when any
PNG changed, commits the result back to the dispatched branch as
`docs(screenshots): refresh captures from CI`. When nothing changed it
skips the commit cleanly.

## Animated demo (`trust-contract-demo.webm`)

A short clip recorded via Playwright that shows the dashboard
toggling between the live forecast state and the
`?mock=missing` trust-contract state. The README and
[`../case-study.md`](../case-study.md) embed it via an HTML
`<video>` tag (GitHub renders these natively).

To regenerate it locally:

```bash
npm run record:trust-contract-demo
```

The script (`scripts/record-trust-contract-demo.mjs`) spins up
the dev server, navigates a Playwright-driven Chromium between
`/` and `/?mock=missing`, captures a webm via Playwright's
built-in `recordVideo` option, and writes the result to
`docs/screenshots/trust-contract-demo.webm`. The recording is
small (≈1 MB) and is committed so the README has a visible demo
without requiring CI artifacts.
