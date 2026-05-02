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
  api/                       # Open-Meteo + NWS fetch adapters
    openMeteo.js             #   forecast, archive, AQI, geocode, alerts
    transforms.js            #   raw → AppWeatherModel normalization
    types.js                 #   model schema + skeleton factory
  domain/                    # Pure weather classification logic
    weatherCodes.js          #   WMO code → label/icon/gradient
    weatherScene.js          #   forecast + loading + error → UI scene
    meteorology.js           #   storm risk, pressure trend, comfort
    aqi.js  wind.js  temperature.js
  hooks/                     # React orchestration + persistence
    useWeatherDashboardViewModel.js  # composes the dashboard hook bag
    useWeather.js            #   location + saved-cities + sync
    useWeatherData.js        #   forecast + supplemental fetch lifecycle
    useClimateComparison.js  #   historical archive lifecycle
    useLocation.js           #   geolocation + persisted/saved cities
    useSavedLocationsSync.js #   pull/push cloud sync orchestration
    useCitySearch.js         #   debounced abortable geocoder
    useRainAnalysis.js  useDeferredMount.js  useDisplayPreferences.js
    useLocalStorageState.js  useAppShellEffects.js
    climateComparison.js  savedLocationsSyncHelpers.js   # pure helpers
  components/                # React surface
    layout/                  #   AppShell, AppHeader, StatusStack,
                             #   WeatherDashboard, SupplementalWeatherPanels
    header/                  #   Saved cities, sync panel, display settings
    ui/                      #   Card primitives, DataTrustMeta, InfoDrawer
    HeroCard, RainCard, ForecastCard, NowcastCard,
    StormWatch, HourlyCard, AlertsCard, ExposureSection,
    CitySearch, WeatherIcon, AppErrorBoundary
  services/                  # Cross-cutting services
    savedLocationsSync.js    #   sync key + jsonblob persistence
  utils/                     # Pure helpers
    numbers.js               #   strict toFiniteNumber (rejects null)
    weatherUnits.js  meteorology.js  dates.js  dataTrust.js
    sunlight.js  timeSeries.js  weatherCodes.js  temperature.js
```

Each layer has a strict dependency direction:
`components → hooks → api/services → utils/domain`. Components never
fetch directly; hooks never compute UI gradients; the API layer
never imports a React module.

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
- `npm test` passes (`129` tests)
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

## Architecture Decisions

Short notes on the non-obvious choices a reviewer might question.

- **Forecast is always fetched in Fahrenheit / inch units; conversion is client-side.** Switching the °F/°C toggle must not trigger a refetch — it would invalidate the displayed timestamp and confuse users. A Playwright test asserts that toggling units does not refetch.
- **Three independent fetch tracks.** Forecast, supplemental (AQI + alerts), and climate-archive run concurrently with separate AbortController + request-id pairs. A slow archive call cannot delay the hero card; an alerts feed outage cannot wipe the AQI reading.
- **NWS alerts are U.S.-only by design.** A 400/404 from `api.weather.gov/alerts/active` is mapped to an explicit `unsupported` status (not `unavailable`) so the UI can say "Alerts unavailable for this region" instead of an ambiguous "no alerts".
- **Strict numeric coercion at the API boundary.** `Number(null) === 0` would surface as a fake 0°F humidity / 0% rain chance / 0°F historical sample whenever Open-Meteo returns a missing data point. A single shared `toFiniteNumber` helper rejects nullish, empty-string, boolean, array, and object inputs explicitly. Eight unit tests lock the contract.
- **Lazy supplemental panels.** The hero, exposure cards, and rain card render synchronously. Hourly chart, storm watch, alerts, forecast, and nowcast are mounted via `Suspense` after a `requestIdleCallback` (or 180ms fallback) so the first paint is just the data the user sees first.
- **CSS lives next to its component.** App.css holds only global tokens, resets, animations, and one shared focus-visible rule used across header buttons and retry buttons. Every feature's CSS is imported by its owning component.

## Recent Hardening

- **Unicode-escape rendering bug** — JSX text leaking literal `°` on the hourly chart Y axis and `—` in the AQI/UV empty state was fixed and now gated by an automated regression test.
- **Hourly chart "Now" alignment** — the active-hour indicator now snaps to the current hour band instead of skipping ahead to the next future timestamp, with a new `currentSlotToleranceMs` option in `findWindowStartIndex` and unit coverage to lock the behavior in.
- **Architecture trim** — extracted shared `CardFallback`, `useDeferredMount`, and `useClimateComparison` primitives to replace duplicated and oversized hook code. Pure helpers for climate comparison and saved-locations sync moved to dedicated modules with direct unit coverage. Activated the previously-unused `usePanelPreload` hook so heavy lazy panels warm up during browser idle.
- **CSS co-location** — `App.css` shrank from 2,067 to roughly 500 lines as `DataTrustMeta`, `InfoDrawer`, `AppShell`, `StatusStack`, the bento dashboard layout, and the entire header surface moved next to their owning components.
- **Scoped live regions** — `SyncAccountPanel` no longer wraps its full body in `aria-live="polite"`; only the error (`role="alert"`) and last-synced timestamp (`role="status"`) announce, and the truncated sync key advertises its full value via aria-label.
- **Strict API number coercion** — `Number(null)` is `0`, which silently surfaced as fake `0%` humidity, `0 hPa` pressure, `0°F` dew point, and `0°F` historical samples whenever Open-Meteo returned partial data. A shared `toFiniteNumber` helper rejects nullish/empty/boolean/object inputs at the API boundary, then routes the same contract through every per-element parser in HourlyCard, ForecastCard, NowcastCard, and `useRainAnalysis`.
- **In-flight async announcement** — async buttons (Use my location, Allow location, Retry, Sync now, Disconnect, Create cloud account) now expose `aria-busy` while their work is in flight, so screen-reader users get a signal even after tabbing away.
- **Climate comparison nullish-input fix** — `buildClimateComparison` now rejects nullish temperatures explicitly instead of coercing them to zero, which previously could surface fake "65°F warmer than average" lines for partial archive responses.
- **Status-stack collapse** — App.jsx no longer mounts two `role="status"` regions on every render.
- **Per-panel error boundary** — a lazy chunk loading failure (HourlyChart, StormWatch) used to take down the whole app via the root error boundary. A new `PanelErrorBoundary` isolates per-panel render and dynamic-import errors so the rest of the dashboard keeps working.
- **Null-coordinate guard** — `parseCoordinates(null, null)` no longer silently resolves to `(0, 0)` Null Island; the same strict numeric helper now protects geolocation parsing and saved-city storage.
- **DataTrustMeta age guard** — a null `lastUpdatedAt` no longer computes a fake "Stale data (millions m old)" warning before the first response.
- **Alert overflow signal** — when NWS returns more than four alerts the card now surfaces an "+ N more alerts not shown" footnote ordered by priority.
- **prefers-reduced-data support** — when the user-agent reports `prefers-reduced-data: reduce`, the historical-archive call is suppressed automatically. The user-facing climate toggle is unchanged.

## Known Limitations

- **U.S.-only severe alerts.** NOAA / NWS coverage stops at the U.S. border; non-U.S. locations fall back to explanatory messaging instead of a false all-clear.
- **Lightweight cloud sync.** The optional sync flow uses a public jsonblob.com store and expects either a full sync URL or a configured `VITE_AURA_SYNC_API_BASE`. It is not encrypted at rest and is not a substitute for an account system.
- **Geolocation falls back fast.** If the browser's geolocation prompt does not resolve in 5 seconds the app drops to the Chicago default rather than blocking the dashboard. The user can re-trigger the prompt at any time from the header.
- **Historical archive lag.** The Open-Meteo archive is updated daily and may not include the most recent week; on those days the climate-context panel shows "Climate context unavailable" instead of a stale comparison.
- **No service worker / offline mode.** A dropped connection during a refresh keeps the previous reading on screen with a `Stale data` warning, but the app does not synthesize cached forecasts when fully offline.
- **Lighthouse budget passes locally** but real-world performance varies with the network. The CSS and JS footprint shrunk substantially during the audit (App.css 2,067 → ~500 lines), but a service worker and image-pre-caching pass would still be the next wins.

## Portfolio / Case Study Notes

The strongest narrative for this project is the **trust contract**: the audit found and fixed a class of `Number(null) === 0` bugs that silently rendered missing API readings as `0%` humidity, `0 hPa` pressure, `0°F` historical samples, `(0, 0)` Null-Island geolocation, and millions-of-minutes "Stale data" warnings. A single shared `toFiniteNumber` helper at the API boundary, with explicit fallback per call site, replaced six independent inline coercions. Every layer now has direct unit tests pinning the contract.

Other strong stories:

- **Resilient client composition** — three independent fetch tracks (forecast, supplemental AQI/alerts, historical archive) with separate AbortControllers and request-id stale-result guards, plus a per-panel error boundary so a lazy chunk failure cannot blank out the dashboard.
- **Responsive, mobile-first dashboard** — the bento layout has explicit breakpoints at 1200/980/860/760/640/560/420 px, hover-only effects gated behind `(hover: hover)`, and `prefers-reduced-motion` overrides for every animation. Co-located component CSS replaces what was a 2k-line monolith.
- **Accessibility past axe baseline** — scoped live regions (`role="alert"` for errors, `role="status"` for last-synced metadata), `aria-busy` on async buttons, decorative SVG cleanup, keyboard combobox for search, and a regression test that scans rendered text for literal `\uXXXX` escape sequences.
- **QA maturity** — 129 unit tests covering API normalization, climate comparison, location persistence, sync helpers, time-series snap, AQI/UV/weather-code lookup, and trust-meta age formatting; 13 Playwright checks for smoke, visual regression, axe-core, and the unicode-escape leak guard; CI Lighthouse budget gate.

## Screenshot Guidance

- **Desktop hero shot** — current conditions hero, exposure metrics, and risk panels visible together so the bento composition is obvious.
- **Mobile stack shot** — the dashboard at ≤420 px proving the layout stacks cleanly with no horizontal overflow.
- **Trust-contract shot** — a card or trust-meta row showing `—` for a missing reading, captured with a network mock that returns null. This is the strongest single signal of the trust narrative.
- **Alert overflow shot** — five or more mocked alerts so the new "+ N more alerts not shown" footnote is visible.
- **Empty/error states** — the unsupported-region alerts fallback, the refresh-error retry banner, and the permission-onboarding card. These say "the team thought about failure modes" louder than a polished happy-path shot.

## Recruiter Notes

This is a frontend-only project (HTML5, CSS, JavaScript, React 19) with no backend, no component library, and no UI framework beyond Lucide icons. It is strongest as a sample of:

- defensive client-side data handling with end-to-end nullish-rejection contracts
- multi-API composition with independent fetch lifecycles
- responsive, accessible dashboard layout written in plain CSS
- QA breadth: unit, integration, E2E (Playwright + axe), visual regression, Lighthouse budgets

It is not a full production weather platform. The strongest recruiter signal is the combination of stability fixes (caught and fixed during an internal audit), accessible/mobile hardening, and the QA suite that locks the trust contract so the same bug class cannot regress.
