# Aura Weather QA Checklist

Manual verification list to run before merging substantial changes.
Most items have automated coverage already; this is the human
double-check that catches things the test suite cannot.

For automated checks, run `npm run lint && npm test && npm run build
&& npm run test:e2e && npm run test:lighthouse` first — every box
below assumes those pass.

CI runs the same gate serially for Playwright with
`npm run test:e2e -- --workers=1` for run stability (visual
regression testing was removed; serial execution keeps the
capture-heavy suite deterministic on shared runners).

## First-load happy path

- [ ] Cold load (`http://127.0.0.1:5173/`) shows the Palos Hills hero card
      within ~1 second
- [ ] Header brand `Aura` and tagline `Atmospheric Intelligence` are
      visible on first paint
- [ ] The value line "Today's conditions, honest about what it
      doesn't know." renders under the brand
- [ ] Slow initial network shows the dashboard-shaped loading shell with
      provider status copy and no fake weather values
- [ ] Granting browser location upgrades to a friendly nearby place
      name via reverse geocoding (e.g. "Crystal Lake, United States"
      plus a "Showing your device location near ..." note); the
      generic "Current location" label appears only if the naming
      lookup fails
- [ ] Permission-onboarding card reads "Start with Palos Hills, switch
      anytime" with value-preview copy and two CTAs
      (Allow location access · Keep Palos Hills for now)
- [ ] Bento groups render in order: Current Conditions → Near-Term
      Outlook → Precipitation Radar → Nowcast → Precipitation Outlook →
      Storm Watch → Week Ahead → Atmospheric Conditions

## Search

- [ ] Typing a 1-character query does *not* trigger a network request
      (debounced + min length)
- [ ] Typing a 2+ character query shows a "Searching locations..."
      status before any "No matching cities" message
- [ ] Selecting a result clears the input, blurs the field, and
      switches the dashboard to the new city
- [ ] Focusing an empty search after saving a city shows saved-city
      suggestions without typing
- [ ] Pressing `/` (when not focused on an input) focuses the search
      field
- [ ] Escape closes the dropdown and blurs the field
- [ ] Arrow up/down navigates results; Enter selects

## Saved cities

- [ ] Selecting a city auto-saves it as a chip in the saved-cities
      strip
- [ ] Clicking a saved chip switches to that city
- [ ] Switching cities clears the previous city's weather **before** the
      new fetch lands (no Tokyo header above Chicago numbers)
- [ ] Clicking the X on a saved chip removes it from the strip
- [ ] Removing the active saved city clears the startup-location
      preference and shows the "Saved startup location removed" notice

## Data trust

- [ ] Visit `/?mock=missing` — humidity, pressure, dew point render
      muted "—" not "0%" / "0 hPa" / "0°F"
- [ ] The same route shows the labelled portfolio demo notice, so it
      cannot be mistaken for live provider data
- [ ] The hero daily guidance shows unavailable states for missing rain,
      UV, or wind inputs instead of inventing advice
- [ ] Missing readings carry the assistive-tech cue: each "—" is a
      span with `aria-label="No data available"`, and the atmosphere
      panel appends the footnote "— means the provider didn't report
      that reading. It isn't a zero."
- [ ] The radar slot shows the "Radar not queried in this demo" card
      (no Leaflet map mounts, and no radar/tile hosts are contacted)
- [ ] AQI / UV cards read "Unavailable" with a "No live data" pill (not
      a 0 gauge); supportText explains the missing reading without
      claiming a fake zero value
- [ ] Daily forecast rows with null highs/lows render "—" not "0°"
- [ ] Switch back to live data and confirm every value reappears as a
      real reading

## Refresh + retry

- [ ] When the API is slow (devtools Network throttling), the cards
      show a "Refreshing" pill on a same-city refresh
- [ ] If a refresh fails, the app shows a "Could not refresh weather
      right now" banner with a Retry button
- [ ] If the browser starts offline with a cached forecast, Aura renders
      the saved snapshot and shows a banner naming the failed live
      forecast source plus the saved timestamp
- [ ] If the only cached forecast is older than 12 hours, Aura does not
      restore it as daily guidance
- [ ] The Data Sources panel distinguishes live forecast data, saved
      forecast data, missing AQI, unsupported NOAA/NWS alert coverage,
      and disabled/reduced-data archive context
- [ ] Transient forecast, geocode, AQI, alerts, and archive failures
      retry; unsupported NWS regions still show the coverage fallback
      without retry churn
- [ ] The Retry button enters a 1.4s cooldown and shows "Retrying..."
      while disabled

## Offline app shell

- [ ] In a production build/preview, the browser registers `/sw.js`
      after page load
- [ ] After one successful production visit, switching DevTools to
      offline and reloading still renders the Aura app shell
- [ ] On first production install, the status stack shows "Offline shell
      ready" and the Got it action dismisses it
- [ ] When the browser exposes `beforeinstallprompt`, Aura shows the
      Install/Later prompt without blocking the dashboard
- [ ] Offline weather refreshes show the saved-forecast banner rather
      than claiming live provider data is fresh; stale snapshots older
      than 12 hours do not restore
- [ ] Clearing site data removes the service worker/cache and returns
      the app to normal first-load behavior

## Climate context

- [ ] Toggling Climate Context off does **not** trigger a forecast
      refetch (Network panel: only the archive call disappears)
- [ ] Toggling it back on issues the archive call against the existing
      forecast snapshot
- [ ] When `prefers-reduced-data: reduce` is set in the OS, the
      archive call is suppressed even with the toggle on

## Severe alerts

- [ ] U.S. location: alerts list renders or "No active severe alerts"
- [ ] Non-U.S. location (e.g. Tokyo): "Alerts unavailable for this
      region" with the Coverage unavailable trust badge
- [ ] When more than 4 alerts are present, the "+ N more alerts not
      shown" footnote appears at the bottom of the card

## Cloud backup (optional flow)

- [ ] Cloud Backup is hidden on fresh first load with no saved cities
- [ ] Selecting or saving a city reveals Cloud Backup below the saved-city
      strip
- [ ] Start backup → the toggle reads "Backed up"; no sync key, no
      pasteable value, and no "across devices" claim appears anywhere
- [ ] Saving another city auto-backs-up after ~1s and "Last backed up"
      updates
- [ ] Reload the page → saved cities are still present and the panel still
      reads "Backed up" (the anonymous session persists in localStorage)
- [ ] Stop backup → the panel returns to "Not backed up", the row is gone
      from `public.saved_cities`, and local saved cities are unchanged
- [ ] A backup failure produces a `role="alert"` error in the panel

### Cloud backup — RLS isolation (manual, pre-release)

Row-level security is a Postgres guarantee, not app logic. The automated
suite cannot prove it: `npm test` is bare `node --test` with no network, and
CI injects no Supabase credentials. The service tests exercise the storage
layer against a fake client and deliberately stop short of claiming
otherwise. Verify isolation by hand before any release that touches
`public.saved_cities` or its policies.

Two anonymous sessions must not see or touch each other's rows. The check is
scripted so it can actually be re-run, rather than described:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<publishable key> \
node supabase/tests/saved-cities-rls.mjs
```

- [ ] The script exits `0` with **11/11 checks passed**. It signs in two real
      anonymous users over the same REST path the app uses and asserts that B
      reads zero of A's rows, updates zero, deletes zero, is refused (`403`,
      `new row violates row-level security policy`) when forging a row owned
      by A, that the publishable key with no session can neither read nor
      write, and that A's row survives all of it. It removes the rows it
      wrote. Pass `SUPABASE_SERVICE_ROLE_KEY` as well to delete the two
      anonymous users it created; otherwise remove them from the dashboard.

Then confirm the two things the script cannot see, in a browser:

- [ ] Start a backup and save a city. In a **private/incognito** window (a
      separate anonymous session) start a backup too — it must show **none**
      of the first window's cities.
- [ ] Clearing browser data discards the session; the next visit is a **new**
      anonymous user with an empty backup and no route back to the old rows.
      That is expected, not a bug.

## Accessibility

- [ ] Tab order before saved cities: skip link → search → my location
      → climate toggle → unit toggle → main content
- [ ] Tab order after saved cities: skip link → search → my location
      → saved cities → sync panel → climate toggle → unit toggle →
      main content
- [ ] `Skip to main content` link is the first focusable element and
      visible on focus
- [ ] All interactive controls have visible focus rings
- [ ] Screen reader (VoiceOver / NVDA) announces:
      - "Searching locations..." while the geocoder is in flight
      - "No data available" when reaching a missing-stat value
      - "Updating weather for your current settings..." during a
        background refresh
- [ ] Disabled async buttons report `aria-busy="true"` while their
      work is in flight (use Accessibility Tree in devtools)

## Mobile (390 × 844 viewport)

- [ ] No horizontal scroll
- [ ] Daily guidance stacks into single-column rain / UV / wind cards
      before the sunlight section
- [ ] Hero card stacks: location → high/low → temp + icon → condition
- [ ] Bento groups collapse into single column at ≤ 640 px
- [ ] Rain and hourly panels show touch sample strips, and selecting a
      sample updates the selected value without layout shift
- [ ] Saved cities wrap; X button is at least 24×24
- [ ] Search dropdown does not overflow the viewport
- [ ] The `/` keyboard hint is hidden (it is keyboard-only)

## Reduced motion

- [ ] System "Reduce motion" enabled: card-slide-up + bento-section
      hover transforms are disabled
- [ ] Loader weather icon does not pulse
- [ ] Loading skeleton sheen is suppressed
- [ ] Refreshing-pill animation is suppressed

## Performance

- [ ] Lighthouse local budget passes (`npm run test:lighthouse` audits
      the deterministic `?mock=missing` app shell)
- [ ] Switching the unit toggle does **not** trigger a forecast or
      archive refetch (verify in devtools Network)
- [ ] Backgrounding the tab pauses the 1-minute trust-meta clock
      (verify with Performance → Recordings)

## Build artifact sanity

- [ ] `dist/` stays near its current ~2.3 MB (the radar/Leaflet and
      Supabase chunks load lazily and are not on the initial route)
- [ ] `/?mock=missing` in a production build shows the labelled demo
      notice and does not attempt live provider fetches
- [ ] No `console.error` / `console.warn` in production smoke run

---

If you find a regression, log it as an issue, link the failing item
above, and add a test that would have caught it.
