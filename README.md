# Aura - Atmospheric Intelligence

Aura is a modern weather dashboard focused on real atmospheric signal quality, not just headline temperature.
It combines live weather data, adaptive visual treatment, and a portfolio-ready interface system.

## Live

- Demo: `https://your-deploy-url-here.com`
- Social preview image: [`public/og-image.png`](./public/og-image.png)

## What Makes It Portfolio-Ready

- Clear product framing: current conditions, near-term outlook, risk signals, and week-ahead planning.
- Consistent design system: shared tokens for spacing, typography, surfaces, elevation, and motion.
- Polished interactions: meaningful card transitions, grouped section reveals, keyboard-first controls, and reduced-motion fallbacks.
- Accessibility attention: semantic regions, ARIA usage, skip link, visible focus states, and stronger high-contrast mode support.

## Core Features

- Real-time weather, air quality, and geocoding via Open-Meteo.
- Unit switching between Fahrenheit and Celsius.
- City search with keyboard navigation and async request cancellation.
- Current-location lookup with graceful status handling.
- Hero conditions card with climate comparison context.
- Hourly temperature chart, nowcast, rain intelligence, storm watch, and 7-day forecast.

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

## Tech Stack

- React 19
- Vite 6
- Recharts
- Lucide React
- Plain CSS (token-driven)
- Open-Meteo APIs

## Project Structure

```text
src/
  components/      # Visual cards and UI controls
  hooks/           # Custom hooks for state and data orchestration
  services/        # API access layer
  utils/           # Weather/domain utility logic
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
```

## Roadmap

- NWS severe weather alerts (US)
- Saved cities and quick switching
- Visual regression snapshots for UI QA
- Optional radar overlay exploration
