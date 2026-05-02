# Aura Weather

Aura Weather is a React weather dashboard built around fast scanning, atmospheric context, and resilient client-side API handling.

It is designed as a portfolio project with real frontend concerns in scope:

- live weather, geocoding, air quality, and optional climate context
- responsive dashboard behavior from desktop down to small mobile screens
- accessible search, controls, and status messaging
- defensive API fallbacks for unsupported or degraded data sources
- automated smoke, visual regression, and unit coverage

## Live Demo

- Production: [aura-weather-platform.netlify.app](https://aura-weather-platform.netlify.app/)
- Local dev: `npm run dev`

## Product Highlights

- Immediate fallback forecast for Chicago on first load, with optional location permission instead of a stalled geolocation wait
- Current conditions, hourly outlook, rain guidance, risk signals, and 7-day forecast in one surface
- Open-Meteo powered weather, air quality, geocoding, and archive data
- NOAA / NWS severe alerts with explicit unsupported-region fallback messaging
- Saved cities, persisted location preference, and optional cloud sync for saved locations
- Temperature-unit changes stay local to the UI instead of forcing fresh forecast/climate requests
- Keyboard-friendly city search with async cancellation and combobox/listbox behavior
- Search feedback shows a real loading state before any empty-result messaging appears
- Startup-city controls only appear when a startup preference actually exists, reducing first-load clutter
- Reduced-motion-safe card rendering, refreshed mobile layouts, and deferred loading for lower-priority dashboard panels

## Tech Stack

- React 19
- Vite 6
- Lucide React
- Plain CSS
- Playwright + axe-core
- Open-Meteo APIs

## Project Structure

```text
src/
  api/             # Fetch adapters and response normalization
  domain/          # Weather classification and derived scene logic
  hooks/           # Location, sync, weather, and view-model orchestration
  components/      # Dashboard modules, layout, and UI primitives
  services/        # Cross-cutting services such as saved-location sync
  utils/           # Date, unit, and formatting helpers
```

## Running Locally

1. Install dependencies:

```bash
npm ci
```

2. Copy the optional env file if you want key-based sync URLs:

```bash
Copy-Item .env.example .env
```

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://127.0.0.1:5173`

## Environment Variables

Aura works without API keys for weather data.

Optional variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_AURA_SYNC_API_BASE` | No | Base URL for saved-location sync when users enter a short key instead of a full sync URL |

If `VITE_AURA_SYNC_API_BASE` is not set, sync still works when the stored account value is a full URL.

## Quality Checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:visual
npm run test:lighthouse
```

### Latest local QA snapshot

- `npm run lint` passes
- `npm test` passes (`71` tests)
- `npm run build` passes
- `npm run test:e2e` passes (`13` Playwright checks, including smoke, unicode-escape leak guard, and visual regression)
- `npm run test:lighthouse` passes the local budget gate

### Current automated coverage

- Node tests for:
  - API model contracts
  - alert coverage fallback behavior
  - saved-location sync normalization and error handling
  - location persistence helpers
  - weather domain utilities and formatters
- Playwright smoke coverage for:
  - dashboard boot
  - city search and location switching
  - search loading feedback before empty-result states resolve
  - unit switching without refetching forecast/climate data
  - failed cloud-sync connection attempts staying disconnected with an explicit error
  - removing the active saved city clearing persisted startup-location storage
  - unsupported-region severe alert fallback
  - mobile overflow regression
  - regression guard ensuring no literal `\uXXXX` escape sequences leak into rendered text
  - accessibility scan using axe-core
- Playwright visual baselines for:
  - desktop dashboard
  - tablet dashboard
  - mobile dashboard

## Demo Expectations

- First load opens to a usable Chicago forecast immediately instead of stalling on a geolocation permission prompt.
- Browser location is opt-in. Users can keep the fallback city, search manually, or grant location access.
- Core weather data loads first. Air quality, alerts, and climate context can recover independently if a secondary API is slow or unavailable.
- Search shows a loading state before empty results, so users do not get a premature "No matching cities" response.
- Startup-city controls stay hidden until a startup preference actually exists.
- Failed cloud sync connection attempts surface an error and stay disconnected instead of leaving a stale connected-looking state.
- Cloud sync is optional and intentionally secondary to the main forecast workflow.

## Accessibility Notes

- Skip link to main content
- Visible focus states
- Keyboard-searchable city combobox
- Live status messaging for loading and refresh states
- Reduced-motion-safe card visibility and transitions
- Updated mobile touch targets for smaller utility controls

## Recent Hardening

- **Unicode-escape rendering bug** — JSX text leaking literal `°` on the hourly chart Y axis and `—` in the AQI/UV empty state was fixed and now gated by an automated regression test.
- **Hourly chart "Now" alignment** — the active-hour indicator now snaps to the current hour band instead of skipping ahead to the next future timestamp, with a new `currentSlotToleranceMs` option in `findWindowStartIndex` and unit coverage to lock the behavior in.
- **Architecture trim** — extracted shared `CardFallback`, `useDeferredMount`, and `useClimateComparison` primitives to replace duplicated and oversized hook code. Pure helpers for climate comparison and saved-locations sync moved to dedicated modules with direct unit coverage. Activated the previously-unused `usePanelPreload` hook so heavy lazy panels warm up during browser idle.
- **CSS co-location** — `App.css` shrank from 2,067 to roughly 1,465 lines as `DataTrustMeta`, `InfoDrawer`, `AppShell`, and `StatusStack` rules moved next to their owning components.
- **Climate comparison nullish-input fix** — `buildClimateComparison` now rejects nullish temperatures explicitly instead of coercing them to zero, which previously could surface fake "65°F warmer than average" lines for partial archive responses.
- **Status-stack collapse** — App.jsx no longer mounts two `role="status"` regions on every render.

## Known Limitations

- NOAA / NWS severe alerts are U.S.-region only; unsupported regions fall back to explanatory messaging instead of a false all-clear.
- Saved-location cloud sync is intentionally lightweight and expects either a full sync URL or a configured `VITE_AURA_SYNC_API_BASE`.
- The current Lighthouse budget now passes locally, but the app still carries a relatively large CSS surface and could be trimmed further for stronger real-world performance margins.

## Portfolio / Case Study Notes

If this project is presented in a portfolio, the strongest story is:

- resilient client-side API composition instead of a single happy-path fetch
- responsive dashboard work that now has smoke and visual regression protection
- accessibility work that goes beyond color tweaks into keyboard flow, live status messaging, and baseline axe coverage
- product decisions around trust cues, unsupported alert regions, location permission onboarding, and startup/sync recovery states

The weakest current story is still long-term performance optimization at scale. This repo is better as a frontend architecture and QA sample than as a claim of fully production-grade performance tuning, and there is still room to reduce CSS and JS weight further.

## Screenshot Guidance

- Use one desktop screenshot that shows the current conditions hero, exposure metrics, and risk panels together.
- Use one mobile screenshot that proves the stacked layout stays readable without horizontal overflow.
- If you write a case study, call out the unsupported-region alerts fallback, opt-in location onboarding, and the sync/search trust-state fixes instead of only showing polished visuals.

## Recruiter Notes

This project is strongest as a frontend implementation sample for:

- API integration and defensive client-side data handling
- responsive dashboard composition
- accessible interaction design
- CSS systems work without a component library
- QA maturity beyond a basic tutorial app, including regression coverage for async search, sync failures, and persistence cleanup

It is not pretending to be a full production weather platform. The strongest recruiter signal now is the combination of resilient client logic, accessible/mobile hardening, and a QA setup that includes smoke, visual, and Lighthouse gates. The remaining gap is headroom: the budget passes, but there is still room to slim the CSS/JS footprint further.
