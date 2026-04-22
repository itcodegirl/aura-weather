# Aura - Atmospheric Intelligence

Aura is a modern weather dashboard focused on real atmospheric signal quality, not just headline temperature.
It combines live weather data, adaptive visual treatment, and a portfolio-ready interface system.

## Live

- Demo: add your deployed URL before portfolio sharing (for example Netlify or Vercel)
- Local demo: run `npm run dev` and open `http://127.0.0.1:5173`
- Social preview image: [`public/og-image.png`](./public/og-image.png)

## What Makes It Portfolio-Ready

- Clear product framing: current conditions, near-term outlook, risk signals, and week-ahead planning.
- Consistent design system: shared tokens for spacing, typography, surfaces, elevation, and motion.
- Polished interactions: meaningful card transitions, grouped section reveals, keyboard-first controls, and reduced-motion fallbacks.
- Accessibility attention: semantic regions, ARIA usage, skip link, visible focus states, and stronger high-contrast mode support.

## Recent UX Audit Upgrades

- Added a visible `Climate Context` label above the on/off control so intent is clear for sighted users.
- Re-styled `Forget Saved` as a low-emphasis destructive action instead of a peer toggle.
- Removed the redundant Sunlight panel and rebalanced top-of-dashboard layout around hero + exposure signals.
- Replaced chip-like bento section labels with divider-style headings for stronger structure scanning.
- Upgraded status notice visuals from a decorative dot to an explicit location label treatment.
- Refined exposure metric cards so gauge, status, and density bar read as one coherent meter stack.

## Core Features

- Real-time weather, air quality, and geocoding via Open-Meteo.
- Unit switching between Fahrenheit and Celsius.
- City search with keyboard navigation and async request cancellation.
- Current-location lookup with graceful status handling.
- Hero conditions card with climate comparison context.
- Hourly temperature chart, nowcast, rain intelligence, storm watch, and 7-day forecast.

## Architecture At A Glance

- `src/api`: raw Open-Meteo fetch adapters and response shaping.
- `src/domain`: weather classification and scene derivation logic (`meteorology`, `weatherScene`, `wind`, `weatherCodes`).
- `src/hooks`: orchestration hooks for location, weather fetch lifecycle, display preferences, and dashboard view model composition.
- `src/components/layout`: app shell, header, status stack, and dashboard composition boundaries.
- `src/components/ui`: reusable presentational primitives such as card headers, metric cards, and stats.

## Design Upgrade Summary

### Phase 1 - Foundation

- Reworked visual tokens and typography system.
- Unified card language across major components.
- Improved visual hierarchy and responsive rhythm.

### Phase 2 - Information Architecture

- Added explicit dashboard section group labels.
- Reduced dense rain history content into compact summary pills.
- Added a storm snapshot strip for fast scanning.

### Phase 3 - Polish

- Added motion refinements for section labels and focus-within card emphasis.
- Added reduced-motion and touch-hover safeguards.
- Added high-contrast support tuning.
- Improved metadata and sharing polish in `index.html`.

## Engineering Hardening Phases

### Phase A - Render Efficiency

- Added memoized boundaries in high-cost views (`WeatherDashboard`, `ForecastCard`, `HeroCard`, `RainCard`, `NowcastCard`).
- Reduced duplicate derived computations in intelligence panels (for example `StormWatch` and weather-scene derivation).
- Stabilized list rendering in timeline-heavy UI (rain bars now use stable timestamp keys).

### Phase B - Interaction + Accessibility

- City search now follows combobox/listbox semantics more closely, with direct `role="option"` entries.
- Preserved keyboard-first interaction while preventing focus loss on pointer selection.
- Scoped global outside-click listeners to active/open states only.

### Phase C - State + Data Hygiene

- Prevented redundant location state updates and duplicate persistence writes in weather orchestration hooks.
- Removed obsolete compatibility shims and dead utility exports.
- Added defensive DOM guards around global event registration for broader rendering safety.
- Added a user-facing control to clear persisted location preference for privacy-conscious usage.

### Phase D - Bundle + Runtime Efficiency

- Replaced the hourly chart dependency with a native SVG renderer.
- Removed `recharts` from runtime dependencies and cleaned stale build chunk config.

## Tech Stack

- React 19
- Vite 6
- Lucide React
- Plain CSS (token-driven)
- Open-Meteo APIs

## Project Structure

```text
src/
  api/             # API adapters + weather model normalization
  domain/          # Classification and weather-scene logic
  hooks/           # Data orchestration and app lifecycle hooks
  components/      # Layout, weather modules, and UI primitives
  services/        # Shared service helpers
  utils/           # Date/unit/format utilities
  App.jsx          # Dashboard composition
  App.css          # Global design system and layout
```

## Getting Started

```bash
npm install
npm run dev
```

## Quality Checks

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:lighthouse
```

## E2E Smoke Tests

- Framework: Playwright + axe-core.
- Coverage includes dashboard load, city-search location switch, and baseline accessibility assertions.
- Visual snapshots: desktop/tablet/mobile regression checks via `e2e/visual-regression.spec.js`.
- First-time setup for local machines:

```bash
npx playwright install chromium
```

- Run visual checks:

```bash
npm run test:visual
```

- Update visual baselines intentionally:

```bash
npm run test:visual:update
```

## Lighthouse Budgets

- Budget command: `npm run test:lighthouse`
- Budget config: `config/lighthouse-budgets.json`
- Runner script: `scripts/run-lighthouse-budgets.mjs`
- Enforced categories: performance, accessibility, best practices, and SEO.
- PR automation: `.github/workflows/quality-gates.yml`

## Roadmap

- NWS severe weather alerts (US)
- Saved cities and quick switching
- Visual regression snapshots for UI QA
- Optional radar overlay exploration
