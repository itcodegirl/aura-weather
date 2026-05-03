# Aura Weather QA Checklist

Manual verification list to run before merging substantial changes.
Most items have automated coverage already; this is the human
double-check that catches things the test suite cannot.

For automated checks, run `npm run lint && npm test && npm run build
&& npm run test:e2e` first — every box below assumes those pass.

## First-load happy path

- [ ] Cold load (`http://127.0.0.1:5173/`) shows the Chicago hero card
      within ~1 second
- [ ] Header brand `Aura` and tagline `Atmospheric Intelligence` are
      visible on first paint
- [ ] Permission-onboarding card reads "Set your forecast once, then
      keep moving" with two buttons
- [ ] Bento groups render in order: Current Conditions → Near-Term
      Outlook → Risk Signals → Week Ahead

## Search

- [ ] Typing a 1-character query does *not* trigger a network request
      (debounced + min length)
- [ ] Typing a 2+ character query shows a "Searching locations..."
      status before any "No matching cities" message
- [ ] Selecting a result clears the input, blurs the field, and
      switches the dashboard to the new city
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
- [ ] The hero stats helper note appears: "Some readings are
      unavailable from the provider..."
- [ ] AQI / UV cards read "AQI offline" / "UV offline" with a "No live
      data" pill (not a 0 gauge)
- [ ] Daily forecast rows with null highs/lows render "—" not "0°"
- [ ] Switch back to live data and confirm every value reappears as a
      real reading

## Refresh + retry

- [ ] When the API is slow (devtools Network throttling), the cards
      show a "Refreshing" pill on a same-city refresh
- [ ] If a refresh fails, the app shows a "Could not refresh weather
      right now" banner with a Retry button
- [ ] The Retry button enters a 1.4s cooldown and shows "Retrying..."
      while disabled

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

## Cloud sync (optional flow)

- [ ] Cloud Sync panel collapses by default
- [ ] Create cloud account → key appears, ellipsised at 32 characters,
      tooltip + aria-label expose the full key
- [ ] Pasting an invalid sync URL produces a `role="alert"` error and
      the panel stays disconnected
- [ ] Disconnect clears the panel back to the not-connected state

## Accessibility

- [ ] Tab order: skip link → search → my location → saved cities →
      sync panel → climate toggle → unit toggle → main content
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
- [ ] Hero card stacks: location → high/low → temp + icon → condition
- [ ] Bento groups collapse into single column at ≤ 640 px
- [ ] Saved cities wrap; X button is at least 24×24
- [ ] Search dropdown does not overflow the viewport
- [ ] The `/` keyboard hint is hidden (it is keyboard-only)

## Reduced motion

- [ ] System "Reduce motion" enabled: card-slide-up + bento-section
      hover transforms are disabled
- [ ] Loader weather icon does not pulse
- [ ] Refreshing-pill animation is suppressed

## Performance

- [ ] Lighthouse local budget passes (`npm run test:lighthouse`)
- [ ] Switching the unit toggle does **not** trigger a forecast or
      archive refetch (verify in devtools Network)
- [ ] Backgrounding the tab pauses the 1-minute trust-meta clock
      (verify with Performance → Recordings)

## Build artifact sanity

- [ ] `dist/` is < 1 MB total
- [ ] `?mock=missing` is **not** present in production bundles:
      `grep -r "mock=missing" dist/ && echo LEAKED || echo OK`
- [ ] No `console.error` / `console.warn` in production smoke run

---

If you find a regression, log it as an issue, link the failing item
above, and add a test that would have caught it.
