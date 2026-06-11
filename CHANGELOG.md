# Changelog

Notable changes to Aura Weather. The audit pass below captures the
work that hardened the dashboard from a polished demo into a
portfolio-grade product. Format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — Real-world reliability: auto-refresh, derived-metric honesty (2026-06)

### Added

- **Automatic refresh on natural opportunities.** The dashboard never
  refetched on its own: a tab left open overnight kept showing
  yesterday's forecast, and a dropped connection left the error banner
  up after connectivity returned. Two listeners now close that gap —
  `online` and `visibilitychange` trigger a refetch when the app is
  visible, online, and either erroring, showing a restored cache, or
  holding live data older than 30 minutes (minimum 60s between
  automatic attempts). The decision logic is a pure, unit-tested
  policy (`weatherRefreshPolicy.js`, 9 tests); same-coordinate
  refreshes keep current data visible behind the existing
  "Refreshing" pill, so the screen never blanks.
- **Timeout-specific error copy.** A 10-second forecast timeout
  surfaced as the generic "unavailable"; `TimeoutError` now reads
  "Open-Meteo forecast timed out. Check your connection and retry."
- **Blocked-permission location notice.** Denying the geolocation
  prompt produced the same notice as a GPS timeout, hiding the fact
  that the browser will silently swallow further prompts. Permission
  denial (code 1) now explains the blocked state and how to recover.

### Fixed

- **Fake 0° week bound.** A week whose minimum temperatures were all
  missing fell back to `weekMin = 0`, leaking a literal fake "0°" into
  the 7-day summary ("Stable week · 0° to 74°") — a direct violation
  of the data-trust contract. Missing bounds are now `null`, the
  summary omits the range, and the Warm Peak / Cool Dip comparisons
  gained finite guards so a null bound can no longer coerce to 0 and
  hand out fake badges. Render test pins the contract.
- **Fake "Steady" badge from missing rain data.** A day whose rain
  chance was null fell through to the confident "Steady" signal — a
  fake all-clear. It now shows a visibly distinct "Partial data" chip.
- **Fake "Stable" pressure trend from one sample.** A single usable
  pressure reading compared against itself (delta 0) and presented as
  a confident "Stable" trend. One-sample windows now read "Not enough
  data" while still surfacing the current reading.
- **Forecast labels frozen across midnight.** "Today"/"Tomorrow" rows
  were computed once per data fetch; a tab open past the location's
  midnight kept yesterday's labels until a refetch. ForecastCard now
  derives a day-granular `todayIso` from the shared minute tick, so
  rows relabel at the location's midnight without per-minute
  re-renders.
- **Future-dated snapshots read as perpetually fresh.** The cache age
  clamp (`Math.max(0, now - cachedAt)`) made a clock-skewed or corrupt
  snapshot look brand new forever. Snapshots stamped more than 5
  minutes in the future are now rejected (2 new tests).
- **Hourly window honesty.** An API response with fewer than 24 hourly
  slots was still captioned "Next 24h"; the subtitle now reports the
  actual covered window ("Next 18h").
- **Retry race.** The error-banner Retry button only had a 1400ms
  cooldown; a tap after the cooldown but during a still-running
  request aborted and restarted it. Retry now also disables while a
  request is in flight.

## [Earlier] — Saved-city reordering, honest budgets, dead-code removal (2026-06)

### Added

- **Saved-city reordering.** Each saved-city chip gained
  move-earlier / move-later arrows. The buttons use `aria-disabled`
  (not `disabled`) at the list ends so keyboard focus never drops to
  `<body>` when a chip reaches the first or last slot, and an sr-only
  live region announces the new position ("Tokyo moved to position 2
  of 4"). The order is persisted through the same normalize/dedupe
  path as every other saved-cities write and rides the existing
  cloud-sync auto-push. Covered by new unit tests (`moveSavedCity`
  reorder/clamp/no-op contracts) and render tests (single-chip
  hidden state, callback wiring, aria-disabled bound behavior).

### Changed

- **Lighthouse budgets raised to honest levels.** The CI gate
  allowed a performance score as low as 50/100 — loose enough to
  hide a serious regression. With the deterministic `?mock=missing`
  route scoring 98/100/96/100 locally, the budgets moved to
  performance 0.85, accessibility 0.95, best-practices 0.9, SEO 0.9.

### Removed

- **Dead Nominatim reverse-geocode adapter.** `reverseGeocodeCoordinates`
  (plus its cache, retry config, and payload normalizers) lived in
  `src/api/openMeteo.js` but had no callers — the app resolves device
  coordinates through BigDataCloud (`src/api/reverseGeocode.js`).
  Removing it also removes the misleading suggestion that the app
  talks to nominatim.openstreetmap.org.

## [Earlier] — Social cards, PWA screenshots, committed README images (2026-06)

### Fixed

- **README screenshots render on GitHub.** `docs/screenshots/*.png`
  was gitignored while the README embedded those paths and claimed
  the screenshots were committed — every image in the README was
  broken on github.com. The PNGs are now committed and regenerated
  deterministically (`npm run screenshots`: provider mocks, frozen
  clock, Arial-pinned fonts).

### Added

- **Real 1200×630 social card.** `public/og-image.png` was a 343×361
  asset; it is now a native 2:1 dashboard render (hero conditions +
  exposure gauges) captured by the new
  `e2e/social-pwa-assets.spec.js`, and the Twitter card type returns
  to `summary_large_image` with matching declared dimensions.
- **PWA manifest screenshots.** `manifest.webmanifest` now ships
  `screenshots` entries (1280×800 wide, 390×844 narrow) so supported
  platforms show a rich install prompt instead of a bare icon. Assets
  live in `public/screenshots/` and regenerate with the same
  deterministic pipeline.

## [Earlier] — Production hardening audit (2026-06)

### Fixed

- **Location-timezone forecast days.** The 7-day forecast filtered
  and labelled days against the *viewer's* calendar date, while
  Open-Meteo daily entries are calendar dates in the *location's*
  timezone (`timezone=auto`). Viewing a city west of you across the
  date line (e.g. Honolulu from Tokyo) dropped the location's current
  day from the forecast entirely, and "Today"/"Tomorrow" labels could
  shift by one day. A new `getIsoDateInTimeZone` helper resolves
  "today" in the forecast's `meta.timezone` (with a safe local
  fallback), and `formatDayLabel` accepts the timezone plus an
  injectable clock for tests. Five new unit tests pin the contract
  across Honolulu/Tokyo/Chicago date-line cases.
- **Social-card metadata.** `og:image` / `twitter:image` were
  relative paths, which most crawlers resolve to nothing — shares
  rendered as blank cards. Both are now absolute URLs with declared
  type and dimensions, plus `og:url` and `og:site_name`. The Twitter
  card type now matches the committed image's near-square aspect
  (`summary`, not `summary_large_image`, which would crop it to 2:1).
- **Triple-announced pressure trend.** The StormWatch sparkline
  carried the same text as `aria-label`, `<title>`, and `<desc>`,
  so some screen readers announced the trend three times. The
  `aria-label` alone now names the graphic.

### Added

- **Keyboard access to hourly samples.** The hourly sample explorer
  (previously touch-only, `display: none` above 640px) is now the
  keyboard counterpart to the hover-only SVG points at every viewport:
  visually collapsed on larger screens until a sample button receives
  focus (the same reveal-on-focus contract as the skip link), with a
  roving tabindex so the strip is a single Tab stop and
  Arrow/Home/End keys move both focus and selection. Selecting a
  sample also enlarges the matching chart point (radius, not
  transform, so the cue survives `prefers-reduced-motion`). The
  strip's invalid `role="list"` (button children, no listitems)
  became `role="group"`, and the dead per-circle `aria-label`s inside
  the `role="img"` SVG — never announced, descendants of an image are
  presentational — were removed in favor of the existing summary +
  explorer. Two new render tests pin the group role and the roving
  tabindex.
- **Escape collapses forecast details.** An expanded 7-day forecast
  row now closes on Escape and returns focus to its trigger,
  matching the dismiss gesture of InfoDrawer.
- **Supplemental-API preconnects.** `air-quality-api.open-meteo.com`
  and `api.weather.gov` are fetched immediately after the first
  forecast response, so they upgraded from `dns-prefetch` to full
  `preconnect` (DNS + TCP + TLS ahead of need); deferred/opt-in hosts
  (archive, reverse geocoding) stay `dns-prefetch`.

### Changed

- **Manifest orientation unlocked.** `orientation` changed from
  `portrait-primary` to `any` — the dashboard ships explicit tablet
  and desktop layouts, so the installed app no longer fights a
  rotated tablet or desktop window.
- **Polite live regions announce atomically.** The city-search idle
  hint and the display-settings announcement now set
  `aria-atomic="true"` so partial text updates are not read
  mid-sentence.

## [Earlier] — Production polish pass (2026-05)

### Added

- **Current-location recovery regression test.** A new
  `useWeather.render.test.mjs` drives the full grant-location flow with
  a reverse-geocode that resolves *before* the forecast — the ordering
  that a 0ms e2e mock momentarily stranded in global loading — and
  asserts the dashboard lands on the resolved place with live weather
  and `loading === false`. Under the render harness the hook state
  machine recovers correctly, confirming the stall was a browser/Playwright
  timing artifact (already mitigated by latency-modeling the reverse-geocode
  mock) rather than a logic defect; the test now guards that recovery
  contract against future fetch-lifecycle regressions. No production code
  was changed: there is no reproducible state-machine fault to fix, so a
  speculative change to the fetch lifecycle was deliberately avoided.
- **No-JS fallback.** `index.html` now renders a short, styled
  `<noscript>` notice explaining the dashboard needs JavaScript,
  instead of leaving a blank `<div id="root">`.
- **Edge headers and SPA fallback.** `public/_headers` ships the
  non-breaking security set (`X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`,
  `Permissions-Policy` scoped to geolocation) plus a caching policy —
  immutable for content-hashed `/assets/*`, forced revalidation for
  `sw.js` and `manifest.webmanifest` so a deploy is never pinned by a
  stale cache. `public/_redirects` adds the SPA fallback so deep links
  resolve to the app shell. `public/robots.txt` gives crawlers an
  explicit policy.
- **PWA manifest hardening.** `manifest.webmanifest` gained `id`,
  `lang`, and `dir` for a stable installed-app identity and correct
  localisation hints.
- **Project metadata + LICENSE.** `package.json` now declares
  `description`, `keywords`, `homepage`, `repository`, `bugs`,
  `license`, and `engines.node` (>=20); a `.nvmrc` pins Node 20; and
  the repo ships an MIT `LICENSE`.
- **`useDocumentTitle` hook.** Mirrors the active forecast location
  into `<title>` (`Tokyo, Japan · Aura Weather`) once a location is
  known, and restores the static index.html title on unmount so cold
  starts still look branded. Five render tests pin the contract:
  preserves the static title until a name is known, includes the
  country when present, restores on unmount, and ignores non-string
  fields without crashing.
- **Screen-reader location landmark.** The first dashboard heading
  now appends an sr-only `in {location}` suffix (`Current Conditions
  in Tokyo, Japan`) so the heading list anchors to where the data is
  for instead of four generic group labels in a row. Sighted layout
  is unchanged.
- **Mobile settings drawer.** `HeaderControls.jsx` exposes a
  mobile-only "Settings" toggle that collapses the climate context,
  unit, and clear-startup controls behind one button on phones. The
  panel sets `display: none` while collapsed so it stays out of the AT
  tree until requested. Desktop layout unchanged.
- **Per-card retry on lazy-chunk failures.** `PanelErrorBoundary` now
  renders a "Try again" button that bumps an internal `resetKey` and
  remounts children via an identity wrapper, letting React re-evaluate
  the lazy import without taking the dashboard down.
- **`useThemeColor` hook.** Updates `<meta name="theme-color">` (with
  prior-value restore on unmount) so the iOS / Android browser chrome
  blends with the active scene gradient. Runs in a layout effect so
  the chrome bar settles before paint.
- **Layout-aware loading skeleton.** Hero meta + temp + row stripes,
  a circular gauge stub, and eight breathing precip-bar stubs that
  visually pre-figure the bento layout. Reduced-motion path holds the
  bars still.
- **Storage quota guard.** `weatherSnapshotCache` now catches
  `QuotaExceededError`, evicts the oldest snapshot, and retries once
  before yielding gracefully. Test coverage in `weatherSnapshotCache.test.mjs`.
- **Render tests for new code.** `useThemeColor.render.test.mjs`,
  `PanelErrorBoundary.render.test.mjs`,
  `HeaderControls.render.test.mjs`.

### Changed

- **Saved-city touch targets on coarse pointers.** The compact chip,
  "Start", and remove controls expand their tap area toward ~44px on
  touch devices via a transparent pseudo-element (visible chrome
  unchanged), with extra space between the adjacent Start / remove
  controls so a control's hit area never overlaps its neighbour's.
  Desktop pointer behavior is untouched.
- **Build chunking.** `vite.config.js` now splits `react` /
  `react-dom` / `scheduler` into a `react-vendor` chunk and
  `lucide-react` into its own. The app entry chunk drops from ~311 kB
  to ~128 kB, so a deploy that only touches app code re-downloads just
  that and keeps the rarely-changing vendor chunks cached.
- **localStorage write hygiene.** `useLocalStorageState` no longer
  re-writes the current value to `localStorage` on mount, so a visitor
  who never interacts doesn't get default flag values persisted; real
  state changes still write through.
- **Mobile hero density.** The four hero readings (Wind, Humidity,
  Pressure, Dew Point) used to collapse to a single column at 560px,
  producing four full-width rows that pushed the rest of the
  dashboard ~240px below the fold on phones. Keep the 2x2 grid down
  to 421px and tighten the per-stat padding so each cell fits
  comfortably; single-column still kicks in at the narrowest tier
  (≤420px) where individual cells would otherwise crush.
- **Mobile interaction polish.** Killed the default iOS gray
  tap-highlight on every interactive element via a global
  `-webkit-tap-highlight-color: transparent` rule; turned on
  `touch-action: manipulation` to eliminate the legacy 300ms
  double-tap delay on Safari; and normalised `:active` press feedback
  (`scale(var(--press-scale))`) on saved-city chips, the saved-city
  remove + undo actions, the mobile settings toggle, and sync
  buttons + toggle so every tap signals consistently.
- **Keyboard-aware city dropdown.** `100vh` on iOS Safari is the
  largest possible viewport — it does not shrink when the on-screen
  keyboard pops up — so a 320px-tall dropdown could end up entirely
  behind the keyboard on a 375x812 phone. Switch the dropdown's
  `max-height` to `dvh` and keep the `vh` declaration as a fallback
  for engines that do not yet support it.
- **Mobile touch targets.** Saved-city remove (24 → 28px), saved-city
  chips (28 → 36px), status-stack actions and retry (26-28 → 36px),
  location setup (36 → 44px), AppShell error retry (42 → 44px).
- **Safe-area support.** `<meta name="viewport">` adds
  `viewport-fit=cover`; `.app-inner` honours `env(safe-area-inset-*)`
  on every breakpoint. The previous safe-area work was a no-op on
  iOS without `viewport-fit`; this pair makes it actually work.
- **Hero icon position on mobile.** Replaced
  `flex-direction: column-reverse` with a centred horizontal row at
  <640px so the WeatherIcon stays beside (not below) the temperature.
- **Empty-state copy.** Hourly chart, 7-day forecast, and rain
  timeline now name the provider (Open-Meteo) and reassure that other
  panels remain live, instead of a generic "X is temporarily
  unavailable."
- **Accessible button copy.** Climate-context toggle reads "Show /
  Hide historical climate comparison." Cloud Sync chevron exposes
  "Expand / Collapse cloud sync controls" as its accessible name.
- **City search keyboard hints.** `inputMode="search"`,
  `autoCorrect="off"`, `autoCapitalize="words"`, `spellCheck="false"`.
- **Hero "today" rollover.** `buildHeroData` now derives the date
  label from a passed `nowMs`, bucketed to one minute. The label
  refreshes correctly across midnight on long-running tabs.
- **Critical-path preconnects.** Added `preconnect` for the two API
  origins hit on cold start (`api.open-meteo.com`,
  `geocoding-api.open-meteo.com`) and `dns-prefetch` for archive,
  air-quality, and NWS alerts.

### Fixed

- **Timezone-correct "now" for remote cities.** Open-Meteo's
  `timezone=auto` timestamps are the location's naive local clock.
  Display labels round-trip those correctly, but every comparison
  against the real device clock — the hourly "Now" marker + 24h window,
  the nowcast start window, the 7-day "today" filter + Today/Tomorrow
  labels, and the golden-hour wash — drifted by the device/location
  offset when viewing another zone. A shared `getZonedNow(timeZone)`
  reframes "now" into the location's wall clock (the same frame the
  naive strings parse into); display formatters are intentionally
  untouched. Unit tests cover the helper, timezone-aware `formatDayLabel`,
  and the nowcast window contract.
- **Shareable `?lat&lon` deep links.** The read-path that seeds the
  initial location from the URL (`parseLocationFromUrl`) was documented
  and unit-tested but never wired into `useWeather`, and the write-path
  then overwrote the URL — so shared forecast links silently loaded the
  persisted/default city instead. A new pure `resolveInitialLocationState`
  honors a valid deep link over the persisted startup city without
  overwriting it or auto-persisting the shared view; a link that matches
  the startup city is treated as a normal saved-location open. Five unit
  tests pin the precedence.
- **e2e reverse-geocode mock.** The shared mock routed
  `nominatim.openstreetmap.org` with a nested address shape while the app
  calls BigDataCloud (flat `city`/`countryName`), so the "current
  location" test silently hit the live API and broke when that provider's
  data for the fixture coordinates changed. It now mocks the real endpoint
  and shape, with modeled latency so the forecast settles first.
- **HeroCard placeholder test.** The render-test assertion for the
  no-data body copy used a straight apostrophe while the component
  uses a typographic one, so it never matched and quietly failed the
  `code-quality` job; the regex now accepts either form.
- **HeroCard fallback honours known location.** The no-data fallback
  hardcoded "Location unavailable" / "Loading weather", which lied to
  the user during the rare window where the location was already set
  but a weather refetch was still in flight (e.g. during a transient
  retry). Use the known location name when we have one and switch
  the status line to "Loading current conditions…" accordingly.
- **`prefers-reduced-transparency`.** When the OS preference is on,
  drop `backdrop-filter`, lift card opacity to ~96%, simplify the body
  gradient, and disable the wash overlays. Layout and color story
  stay identical.
- **Focus management on global error recovery.** When transitioning
  out of `AppLoadingState` or `AppErrorState`, focus moves to
  `#main-content` so screen-reader users land back in the dashboard
  instead of `document.body`.
- **Hero location aria-label.** A single `aria-label="Location: Tokyo,
  Japan"` replaces the disjoint MapPin + text reading order.
- **Dead `.settings-toggle` CSS.** Removed CSS rules that targeted an
  element with no JSX counterpart.

### Removed

- **Dead `MetricStat` component + `utils/weatherCodes` shim.**
  `IconMetricStat` / `DetailMetricStat` had zero consumers, and
  `utils/weatherCodes.js` was a pure re-export of `domain/weatherCodes`
  that nothing imported. Both removed; the remaining `utils/*` modules
  keep their formatters and stay in use.
- Static `theme-color="#0b1c3f"` is now a default that
  `useThemeColor` overrides at runtime; the meta tag itself remains
  for browsers that load HTML before JS.

## [Audit pass] — 2026-05-04

### Added

- Source-scoped transient retries for Open-Meteo forecast, geocoding,
  AQI, NOAA / NWS alerts, and Open-Meteo Archive requests. Unsupported
  NWS regions still resolve immediately as unsupported coverage rather
  than retrying.
- **Data Trust Contract** enforcement at four layers (API normalization,
  per-element parsers, component fallback rendering, visual + a11y cue).
  See the README's "Data Trust Contract" section for the full layout.
- `src/utils/numbers.js` — strict `toFiniteNumber()` helper that rejects
  `null`, `undefined`, `""`, `boolean`, and `object` inputs explicitly.
  `MISSING_VALUE_PLACEHOLDER` and `isMissingPlaceholder()` constants for
  the shared em-dash glyph.
- `src/utils/temperature.js` exports `formatTemperatureValue()` and
  `formatTemperatureWithUnit()` — the unit suffix is suppressed on the
  missing path so the UI never renders the misleading `"—°F"` string.
- `useDeferredMount`, `useClimateComparison`, `usePrefersReducedData` —
  three new hooks extracted from oversized parents.
- Pure helper modules: `climateComparison.js`, `locationHelpers.js`,
  `savedLocationsSyncHelpers.js`, each with direct unit coverage.
- `PanelErrorBoundary` — isolates lazy-chunk failures so a hourly-chart
  load error cannot blank out the whole dashboard.
- `CardFallback` — shared loading-card primitive (was duplicated
  between `WeatherDashboard` and `SupplementalWeatherPanels`).
- `?mock=missing` labelled portfolio demo route (`src/mocks/missingData.js`)
  for the missing-data trust contract. The app shows an explicit demo
  notice and does not query live providers in that state. A dev-only
  fetch patch remains in `src/dev/missingDataMock.js` for lower-level
  endpoint QA.
- React render-test harness (`@testing-library/react` + `jsdom`) wired
  into `node:test` via a small esbuild-powered loader. No Vitest
  dependency.
- Per-card render tests for `Stat`, `HeroCard`, and `MetricCard` that
  pin the missing-data trust contract at the React DOM level.
- Hero "Some readings are unavailable" helper note when any stat is
  missing, with `role="status"` for assistive tech.
- Alert overflow signal — when NWS returns more than 4 alerts the card
  now surfaces an "+ N more alerts not shown" footnote.
- `prefers-reduced-data` support — historical archive fetch is
  suppressed automatically when the user-agent reports the preference.
- "CURRENT_TEMPERATURE_UNAVAILABLE" aria-label and muted typography for
  the giant hero temperature when the reading is missing.
- Last-successful forecast cache keyed by normalized coordinates, with
  schema/version guards, capped entries, and a cold-start restore path
  for offline or failed Open-Meteo forecast loads.
- A 12-hour freshness window for restored forecast snapshots so Aura
  does not present old weather as daily guidance.
- Hero daily guidance cards for rain gear, UV exposure, and wind comfort
  derived from real forecast data, with unavailable states for missing
  source inputs.
- Data Sources panel that separates forecast, AQI, NOAA/NWS alerts, and
  archive status so live, saved, unsupported, and unavailable states are
  visible without conflating them with missing readings.
- PWA manifest and production-only service worker registration. The
  service worker caches same-origin app-shell/build assets after a first
  online visit while leaving weather provider calls network-truthful.
- PWA runtime status prompts for first-install offline readiness and the
  browser install prompt, with dismissible Install/Later actions.
- Playwright offline-shell regression coverage that verifies the
  production service worker can restore `?mock=missing` after reload
  without network access.
- Deterministic missing-data demo isolation so `?mock=missing` renders
  the trust-contract route without starting live provider requests.

### Changed

- Empty city-search focus now shows saved cities as selectable combobox
  options for faster repeat switching.
- First-load location onboarding and follow-up location prompts use
  shorter copy for better mobile scanning.
- Initial loading now uses a lightweight dashboard-shaped skeleton with
  provider status copy instead of a generic spinner card.
- Decorative animated background blobs were removed; the calmer scene is
  carried by the weather gradient and static atmospheric overlays.
- Mobile rain and hourly panels now expose touch-friendly sample strips
  so dense timeline values can be inspected without hover.
- Cloud Sync now stays hidden on fresh first load until the user has at
  least one saved city, while connected/syncing/error states remain
  visible for recovery.
- Successful browser geolocation now labels raw GPS coordinates as
  "Current location" with no country label instead of inheriting the
  Chicago fallback city/country.
- `App.css` shrank from 2,067 → ~500 lines as the bento dashboard,
  AppHeader, AppShell, StatusStack, DataTrustMeta, and InfoDrawer styles
  moved next to their owning components.
- `useWeatherData` 459 → 354 lines after the climate comparison
  lifecycle moved into its own hook.
- `useSavedLocationsSync` 360 → 273 lines after pure helpers were
  extracted.
- `loadWeather` and `loadSavedCity` collapsed into a shared helper so
  the two paths cannot drift.
- `SyncAccountPanel` no longer wraps its full body in
  `aria-live="polite"`; only the error (`role="alert"`) and last-synced
  timestamp (`role="status"`) announce.
- Async controls (Use my location, Allow location, Retry, Sync now,
  Disconnect, Create sync key) now expose `aria-busy` while their
  work is in flight.
- The jsonblob sync action now says "Create sync key" instead of
  implying Aura creates a real cloud account.
- Refresh/offline banners now name the failed forecast source and, when
  a cached forecast is restored, include the saved snapshot timestamp.
- AQI/UV missing states now name the source that failed or omitted the
  reading instead of using generic unavailable copy.
- Supplemental AQI, archive, and alert requests now retry transient
  failures once while preserving abort behavior and unsupported-region
  alert fallbacks.
- GitHub Actions quality gates now include lint, Node tests, render
  tests, production build, serial Playwright, visual checks, Lighthouse
  budgets, concurrency cancellation, and failure artifacts.
- Lighthouse budget checks now target the deterministic `?mock=missing`
  app shell and use a per-run Chrome profile to avoid stale service
  workers or Windows profile-lock failures.
- The 1-minute `DataTrustMeta` clock pauses while the tab is hidden so
  background tabs do not churn re-renders.
- InfoDrawer trigger uses a `HelpCircle` icon instead of a literal `?`.
- Hero card hides the unit suffix when a reading is missing — `"—°F"`
  is gone everywhere.

### Fixed

- Literal `°` rendering on the hourly chart Y axis and `—`
  rendering in the AQI/UV empty state — JSX text was treating the
  escape sequences as literal characters.
- Hourly chart "Now" indicator skipping ahead instead of snapping to
  the active hour band.
- `parseCoordinates(null, null)` resolving to `(0, 0)` Null Island.
- `dataTrust.toTimestamp(null)` computing "minutes since the Unix epoch"
  and rendering a misleading "Stale data" warning.
- `convertTemp(null)` silently producing `0°F`.
- `Number(null) === 0` coercion throughout — every nullable API field
  was being silently rendered as `0%` / `0 hPa` / `0°F`. Closed at the
  API boundary (`transforms.js`, `openMeteo.js`) and at every consumer
  (HourlyCard, ForecastCard, NowcastCard, RainCard, ExposureSection,
  HeroCard, NowcastCard, MetricCard, WeatherIcon, DataTrustMeta).
- Precipitation and wind formatters silently rendering `"0.00 in"`,
  `"0 mph"`, `"N"`, `"Calm"` for null API reads — `formatPrecipitation`,
  `formatWindSpeed`, `windDirectionName`, and `classifyWind` now route
  through `toFiniteNumber` and surface `"—"` / `"Variable"` / `"Unknown"`
  instead.
- Domain classifiers leaking the same coercion bug — `classifyStormRisk`
  (CAPE input), `calculatePressureTrend` (null pressure slots were being
  counted as 0 hPa data points), and `getWeather` / `WeatherIcon` (null
  code → "Clear" / Sun icon by accident) now route through
  `toFiniteNumber` so the null path is explicit.
- Lazy chunk failures crashing the whole app via the root error
  boundary — now isolated by `PanelErrorBoundary`.
- `buildClimateComparison` producing fake "65°F warmer than average"
  lines when archive responses had nullish samples.
- City switch leaking the previous city's weather under the new city's
  name — weather state now clears on a different-coordinates request,
  while same-city refreshes still keep the snapshot visible behind the
  `Refreshing` pill.
- Date-dependent test in `fetchHistoricalTemperatureAverage` that
  silently failed on a calendar-day boundary.

### Removed

- Dead `.settings-toggle` CSS rules — no JSX referenced the class for
  several refactors.
- Duplicated `CardFallback` (was inline in two layout files).
- Duplicate inline numeric coercion helpers in HourlyCard, ForecastCard,
  NowcastCard, useRainAnalysis (all now route through the shared
  `toFiniteNumber`).
- `src/utils/missingData.js` — duplicate of `numbers.js` with looser
  coercion semantics. `hasFiniteValue` moved into `numbers.js`,
  `MISSING_VALUE_DASH` consumers redirected to the existing
  `MISSING_VALUE_PLACEHOLDER`, dead `formatMissingValue` export removed.
  Single source of truth for the trust contract.

### Tests

- 45 → **244** Node tests across 55 suites, including React render tests
  via `@testing-library/react` + `jsdom`. New regressions pin null-input
  contracts, source-scoped retries, cache restore behavior, honest
  browser-location labels, service worker registration gates, and PWA
  install prompt handling.
- 12 → **15** Playwright smoke/flow checks, including cached offline
  restore, offline app-shell reload, honest GPS labels, missing-data
  placeholders, missing-demo provider isolation, axe-core, and the
  unicode-escape leak guard.
