# Aura Weather — Product + UX Audit

**Scope:** Product usefulness, user flows, information architecture, decision-making clarity, and emotional trust.
**Out of scope (by request):** code refactors. This is a findings report only — no source changes.
**Method:** Full read of the app shell, hooks, and every rendered card, with verbatim copy and `file:line` references.
**Date:** 2026-06-26

---

## 1. Executive summary

Aura is a genuinely strong portfolio piece. Its differentiator — the **data trust contract** ("a missing reading is shown as missing, never as zero") — is real, enforced at four layers, and tested. The first load is non-blocking, the failure states are first-class, and the accessibility work is well past checkbox level. On engineering craft and honesty, this is top-decile for a portfolio weather app.

The product gap is **decision density vs. decision clarity**. Aura has accumulated a lot of surfaces — eight weather modules plus alerts, a radar, a source-health panel, and a footer — and they are rendered as a long stack of visually equal glass cards. The core user job ("What do I need to know about today, in one glance?") is answered by a single hero sentence that often shows *nothing* on a calm day, while the actionable guidance the code already computes (`buildDailyGuidance`: "Bring rain gear", "Use sun protection", "Gusty conditions") is **computed and then dropped, never rendered**. Meanwhile rain/precipitation is told six different ways across the page, and three different "risk" vocabularies compete without a hierarchy.

The net effect: a reviewer sees a beautifully engineered, trustworthy dashboard that is *broader* than it is *sharp*. The highest-leverage work is not adding features — it is **subtraction and hierarchy**: make the hero deliver the day's decisions, collapse redundant rain modules, and let the most decision-relevant information out-rank ambient metrics visually.

**One-line verdict:** Trust and resilience are A-grade; information architecture and at-a-glance decision support are the things standing between "impressive demo" and "I'd actually open this every morning."

---

## 2. Top 10 UX issues (ranked by severity)

### 1. The hero doesn't deliver the daily decisions it computes (and the README promises)
`buildHeroData` computes `dailyGuidance` (rain-gear / sun-protection / wind) and a full `uvPanel`, but `HeroCard.jsx` never destructures or renders either — confirmed: they appear only in `buildHeroData.js` and its test (`src/components/heroCard/buildHeroData.js:519`, `:558`). The hero instead shows one priority-ranked `atmosphereReading` sentence that **returns `null` on calm days** (`buildAtmosphereReading.js:195`) plus ambient status chips ("Muggy", "UV high"). So on a mild day the hero answers "what do I need to know today?" with a temperature and four adjectives. Yet the README states: *"The hero summarizes daily decisions from real forecast data: rain gear, UV exposure, and wind comfort."* The product's headline promise is built in code and discarded before render. **Severity: highest** — this is the core job of the app.

### 2. Dashboard is broad, not sharp — redundant rain story across six surfaces
Precipitation is communicated in: Hourly "Precipitation" tab, **Precipitation Radar**, **Nowcast** (next 2h), **Precipitation Outlook** (RainCard, next 24h), **Storm Watch** (peak rain window), and the **Week Ahead** rain %. Six modules touch rain, several overlapping (Nowcast 2h vs Rain Outlook 24h vs Storm peak-window all answer "when will it rain?"). For an app whose stated goal is "quickly understand… without clutter," this is the clutter. **Severity: high.**

### 3. Three competing "risk" vocabularies with no unifying hierarchy
- Group label **"Risk Signals"** sits over a card titled **"Atmosphere"** (`SupplementalWeatherPanels.jsx:45` vs `AtmosphereBento.jsx:398`) — and that card is mostly *not* risk (humidity, pressure, visibility, moon).
- **Nowcast** uses "High/Moderate/Low immediate risk" (`NowcastCard.jsx:79-82`).
- **Storm Watch** uses "Risk level N of 4" (`StormWatch.jsx:138`).
- **Severe Alerts** uses NWS priorities.
Four different risk scales, four badge styles, no shared severity language. A user can't tell whether "Moderate immediate risk" (Nowcast) is more or less urgent than "Level 2 of 4" (Storm). **Severity: high.**

### 4. Flat visual hierarchy — everything looks equally important
Every module is a `glass` card of similar size and weight. The only differentiated element is the severe-alert banner. A "Very high UV — sunscreen" callout, a "rain in 30 min" nowcast, and the permanently-empty Moon tile all read at the same visual altitude. Nothing tells the eye what matters *today*. **Severity: high** — directly undercuts "decision-making clarity."

### 5. Header control overload + unclear saved-location naming
Desktop header carries ~8 controls before chips; each saved-city chip stacks up to **5** controls (name, ◂, ▸, Start/Startup, ×) (`SavedCitiesStrip.jsx`). The "Start" button label is an ambiguous verb (start *what*?), the "Startup" badge is never explained, and startup management is split across two places — the chip's "Start" button and a separate "Clear startup city" in display settings (`DisplaySettingsControls.jsx:139`). **Severity: medium-high.**

### 6. Four-concept location model is heavier than the app needs
"Recent", "Saved", "Synced", and "Startup" are four distinct concepts. **Recent** locations are invisible and unmanageable anywhere except inside the search dropdown — you can't browse or delete them. **Cloud Sync** (jsonblob key, not encrypted — see Known Limitations) is real but is power-user infrastructure surfaced in the header of a glance-and-go weather app. The conceptual surface area exceeds the daily value. **Severity: medium.**

### 7. A permanently-empty "Moon" tile
`AtmosphereBento` renders a 9th tile that always shows "Not in forecast" / aria-label "Moon phase not in forecast" (`AtmosphereBento.jsx:365-383`). A tile that is *structurally* always empty is the one thing that contradicts the app's otherwise-immaculate "we don't show what we don't have" story — here it shows a slot for data it never has. **Severity: medium** (small fix, outsized symbolic cost).

### 8. Ambiguous "current location" identity
The "My location" button label shifts between "My location" / "Refresh location" / "Finding…" / "Unavailable" based on a heuristic (`location.name === "Current location"`, `HeaderControls.jsx:72`), and a failed reverse-geocode leaves the place labeled generically "Current location" (`useLocation.js:574`) with no signal that naming failed. The user can be looking at their real local forecast while the UI calls it "Current location." **Severity: medium.**

### 9. The hero's "High confidence" pill is unconditional
The trust pill always reads **"High confidence · {age}"** (`HeroCard.jsx:343`) whenever a fetch timestamp exists — it never downgrades for cached, stale, or partial data, even though `trustMeta` carries `cacheStatus` and staleness. An app that built its whole reputation on *not* overstating certainty asserts "High confidence" on a restored-from-cache forecast. **Severity: medium** (it's the one place the trust narrative slips).

### 10. "Weather-nerd" numbers without inline context
- **UV** shows as a bare number; the 0–11 scale is only inside a help drawer (`ExposureSection`).
- The **temperature-range gradient bar** on each forecast row has no label or legend (`ForecastCard`).
- **Wind unit** (mph/km/h) isn't visible on the collapsed forecast row — you must expand to learn the unit.
- **"Rain likely" threshold is inconsistent**: Nowcast draws it at 40% (`NowcastCard.jsx:29`) while RainCard and Hourly use 50%. Same phrase, different bar. **Severity: low-medium.**

---

## 3. Top 10 product strengths

1. **The trust contract is real and load-bearing.** Strict `toFiniteNumber`, `—` placeholders with `aria-label="No data available"`, and an explicit refusal to render fake zeros. This is the single best signal in the project. (`utils/numbers.js`, `README.md` Data Trust Contract.)
2. **Non-blocking first load.** Opens to a usable Chicago forecast instead of stalling on a permission prompt; geolocation is opt-in via clear onboarding ("Start with Chicago, switch anytime"). (`StatusStack.jsx:121-159`.)
3. **Independent fetch lifecycles + per-panel error boundaries.** A slow archive or a dead alerts feed can't blank the hero; a lazy-chunk failure degrades to "{panel} is unavailable" with Try again. (`PanelErrorBoundary.jsx`, README Architecture Decisions.)
4. **Reassuring, non-technical failure vocabulary.** "The rest of the dashboard is still live", "U.S. alerts only", "Not reported here", "Aura will retry on the next refresh." Honest without being scary.
5. **Accessibility well past axe baseline.** Skip link, focus restoration on recovery (`App.jsx:121-129`), roving-tabindex keyboard hourly explorer, escape-to-collapse forecast rows, scoped live regions, `aria-busy` on async buttons.
6. **Friendly GPS labeling with an honest fallback.** Reverse-geocodes "Current location" into a real place name, and degrades gracefully when naming fails.
7. **Respectful saved-city behavior.** Saved cities appear as search suggestions on focus; switching cities does *not* silently rewrite the startup preference (startup stays an explicit choice).
8. **Progressive disclosure of diagnostics.** The source-health panel is tucked behind a "Where this data comes from" `<details>` so the dashboard's first paint isn't paying for a surface most users never open. (`WeatherDashboard.jsx:257-285`.)
9. **Genuine plain-language teaching where it exists.** UV/AQI/CAPE info drawers, the dew-point Dry→Comfortable→Muggy scale, the nowcast "15-minute rain guidance over the next 2 hours" explainer.
10. **Offline/cached resilience labeled honestly.** Restores a last-known snapshot, labels it "Saved" (never "Live"), shows the captured timestamp, and rejects snapshots older than the freshness window rather than presenting stale weather as current.

---

## 4. Recommendations by section

### 4.1 First-load experience
- **What works:** Non-blocking, clear onboarding, good loading skeleton with a 7s "still working" reassurance beat, honest app-error screen ("We couldn't load weather data" → "Reload weather").
- **Gaps:**
  - The brand block says "Aura / Atmospheric Intelligence" (`AppHeader.jsx:45-46`) but there is **no plain one-liner of what the app does or why to trust it**. "Atmospheric Intelligence" is mood, not meaning. Add a value line (e.g., *"Today's conditions, honest about what it doesn't know."*).
  - First screen does **not** answer "what do I need to know about today?" with a decision — see Issue #1. The hero leads with number + condition + feels-like, which is correct, but the actionable layer is missing.
  - Consider showing the permission onboarding's value ("Use your location for local conditions") with a one-tap path that's visually primary; today it competes with "Keep Chicago for now" at similar weight.

### 4.2 Core weather decision flow
- **Render the daily guidance the hero already computes** (Issue #1). Even a minimal chip/line row driven by the existing `dailyGuidance` array would close the single biggest product gap with low effort.
- **Establish a 3-tier visual hierarchy** (Issue #4): (a) *act now* — severe alerts, imminent rain, extreme UV; (b) *plan today* — high/low, rain window, wind; (c) *ambient/reference* — pressure, visibility, moon, dew point. Right now all three tiers render at the same altitude.
- **Unify the risk vocabulary** (Issue #3): one severity scale and one badge style shared by Nowcast, Storm Watch, and Alerts, so "how worried should I be?" has a single ladder.
- Feels-like, current condition, and high/low are clear and well-built — leave them.

### 4.3 Search & location flow
- **Strengths:** Excellent combobox — 300ms debounce, 2-char minimum, full keyboard nav, ARIA combobox semantics, "/" shortcut, loading state *before* empty results so users never get a premature "No matching cities."
- **Fixes:**
  - "My location" label-shifting + silent reverse-geocode fallback (Issue #8). Surface a subtle "couldn't name this spot" hint instead of silently showing "Current location," and consider a stable label with a state icon rather than four different words.
  - Idle empty-state grammar: *"Recent and saved places will show up here after you switch cities."* → e.g. *"Your recent and saved places will appear here."* (`CitySearch.jsx:370`).
  - The "/" shortcut is undiscoverable beyond the badge; fine to keep, but don't rely on it.

### 4.4 Saved / recent / synced / startup locations
- **Reduce concept count** (Issue #6). For a portfolio weather app, "Saved" + "current/searched" is enough to be impressive. Consider demoting Recent to a quiet section (it already only lives in the dropdown) and treating Cloud Sync as a clearly-secondary, opt-in affordance rather than a header-resident panel.
- **Rename and consolidate startup controls** (Issue #5): "Start" → something self-describing like *"Open on launch"* / *"Set default"*; put set-and-clear in one place; explain the "Startup" badge on hover/first use.
- **Thin the chip controls.** Five controls per chip is a lot of competing targets; reorder arrows could move behind an overflow or a drag affordance.
- Cloud Sync copy is good and honest; keep the "Optional" framing and the fact that it stays hidden until a city is saved.

### 4.5 Forecast comprehension
- **High/Low is exemplary** — labels + size + position + divider + color + grouped aria. Use it as the hierarchy model for the rest of the app.
- **Label the units that hide** (Issue #10): wind unit on the collapsed row, a legend/aria for the temp-range gradient bar, and an inline "/11" or band word next to the UV number so the scale isn't drawer-only.
- **Align the "Rain likely" threshold** (Nowcast 40% vs everyone else's 50%) so the same phrase means the same thing across cards.
- Signal chips (Rain Watch / Warm Peak / Cool Dip / Steady / Partial data) are a nice touch and the "Partial data" honesty (instead of a fake "Steady") is on-brand. Keep.

### 4.6 Trust & missing-data honesty
- **This is the crown jewel — protect it.** Two things slightly crack it:
  - The unconditional **"High confidence"** pill (Issue #9). Drive it from `trustMeta.cacheStatus`/staleness: "High confidence", "Saved forecast", "Updating…".
  - The **always-empty Moon tile** (Issue #7) — the one place the UI shows a slot for data it never has. Hide it or replace with something the API supplies.
- Everything else here (per-source health, cache labeling, unsupported-region messaging, error-boundary copy) is excellent and should be foregrounded in the case study.

### 4.7 User confidence
- **Reassure more, here:** add the "what is this / why trust it" one-liner at the top; let the hero state the day's call so the user feels *guided*, not just *informed*.
- **Overload risk, here:** the sheer module count and flat hierarchy. Confidence drops when a user has to scan eight equal cards to find the one fact that affects their morning.
- **Dependability levers:** consistent risk language, a "last updated / source" line that's always visible (the footer does this well), and never asserting more certainty than the data supports.

### 4.8 Portfolio reviewer lens
- **What impresses:** the trust contract, the test pyramid that locks it, independent fetch lifecycles, per-panel boundaries, accessibility depth, and the deliberate `?mock=missing` demo route. These say "this person designs for the unhappy path."
- **What reads as overbuilt/confusing:** Cloud Sync (jsonblob) in a frontend weather demo; the four-concept location model; the number of near-duplicate rain modules; the "Risk Signals/Atmosphere" naming mismatch; the empty Moon tile. A sharp reviewer will read these as "added because they could, not because the user needed them."
- **Net:** the project is stronger if it visibly *edits itself* — fewer, better-ranked modules — than if it shows breadth.

---

## 5. Quick wins (< 1 hour each)

1. **Rename the "Risk Signals" group label to "Atmosphere"** (or rename the card) so the section header and card title agree. One string. (`SupplementalWeatherPanels.jsx:45`.)
2. **Hide the always-empty Moon tile** (remove it from the `atm-grid`, or gate on real data). (`AtmosphereBento.jsx:414`.)
3. **Make the hero render the existing `dailyGuidance` items** (the `notice`/`watch`/`unavailable` ones are already filtered and built) — even a one-line chip row closes the headline gap. (`buildHeroData.js:519`, `HeroCard.jsx`.)
4. **Downgrade the "High confidence" pill** when `cacheStatus === "restored"` or data is stale, using the `trustMeta` already passed in. (`HeroCard.jsx:340-345`.)
5. **Align the Nowcast "Rain likely" threshold to 50%** to match RainCard/Hourly. (`NowcastCard.jsx:29`.)
6. **Fix the idle empty-state grammar** in city search. (`CitySearch.jsx:370`.)
7. **Add the wind unit to the collapsed forecast row** and an aria-label/legend to the temperature-range bar. (`ForecastCard.jsx`.)
8. **Add a value-proposition one-liner** under/near the brand mark (replace or augment "Atmospheric Intelligence"). (`AppHeader.jsx:46`.)
9. **Rename "Start" → "Open on launch"** (or similar) on the saved-city chip; add a tooltip explaining the "Startup" badge. (`SavedCitiesStrip.jsx:219,228`.)
10. **Show a quiet "couldn't name this location" hint** when reverse-geocode fails instead of silently labeling it "Current location." (`useLocation.js:574`.)

---

## 6. Portfolio polish (make it stand out)

- **Edit the dashboard down.** The single most impressive product move would be to *cut and rank*: collapse the rain modules into one progressive "rain" surface, fold Storm Watch's unique bits (CAPE, why-line) into a detail view, and demote ambient metrics below decision metrics. A reviewer who sees fewer, sharper modules reads "product judgment."
- **Make the hero the case study's hero.** A hero that states the day's call ("Rain by 4pm — grab an umbrella. UV high midday.") from the already-computed guidance is a screenshot that sells the whole app.
- **One severity language, visualized.** A shared 4-step severity scale used by alerts/nowcast/storm, with a consistent color ramp, is a strong "systems thinker" signal.
- **Annotate the trust states.** The README already points at `?mock=missing`; add a side-by-side "live vs. degraded" hero image to the case study so the contract is *seen*, not just read.
- **A "today at a glance" summary band** (1–3 decision chips + the single most important sentence) pinned above the fold, with everything else as scroll-to-detail.
- **Mobile decision-first ordering.** On small screens, lead with the decision band and the next rain window; push ambient gauges down.

---

## 7. Suggested case study talking points

1. **"Designing for the unhappy path."** Lead with the trust contract: the `Number(null) === 0` bug class, the four-layer fix, the four-layer test pyramid, and the `?mock=missing` demo. This is already your strongest narrative — keep it first.
2. **"Resilience as a UX decision, not just architecture."** Independent fetch tracks + per-panel error boundaries framed as *user-facing reliability*: a dead alerts feed never wipes the temperature.
3. **"Honesty over false certainty."** The `—` placeholder with screen-reader semantics, "Saved" vs "Live" labeling, "U.S. alerts only" instead of a false all-clear. Pair with the *self-critique* that you found and fixed the one place that slipped (the unconditional "High confidence" pill, the empty Moon tile) — showing you audit your own work is a maturity signal.
4. **"Editing for clarity."** Document the IA decision to *reduce* modules and rank information by decision relevance. Showing what you removed (and why) is more senior than showing what you added.
5. **"Accessibility as a feature, with tests to prove it."** Combobox, roving tabindex, focus restoration, scoped live regions, axe in CI, a regression test for `\uXXXX` leaks.
6. **"Performance with honesty."** Lazy panels, deferred mounts, the source-health panel deferred behind a `<details>`, and a Lighthouse budget gated on a *deterministic* demo route — plus the honest caveat that real-world latency varies.

---

## 8. Appendix — verified copy & references

- First load / loading: `AppShell.jsx:21-23` ("Connecting to weather providers…" → "Still working… your network may be slow."), app-error `AppShell.jsx:78-86`.
- Onboarding: `StatusStack.jsx:124-155` ("Start with Chicago, switch anytime" / "Allow location access" / "Keep Chicago for now").
- IA order (group labels): `WeatherDashboard.jsx` (Current Conditions, Near-Term Outlook, Precipitation Radar) + `SupplementalWeatherPanels.jsx` (Nowcast, **Risk Signals→Atmosphere**, Precipitation Outlook, Storm Watch, Week Ahead).
- Hero: `HeroCard.jsx` (renders atmosphereReading + chips + "High confidence" pill `:343`); unrendered guidance `buildHeroData.js:519,558`; calm-day null `buildAtmosphereReading.js:195`.
- Atmosphere tiles incl. empty Moon: `AtmosphereBento.jsx:365-383,414`.
- Risk vocabularies: `NowcastCard.jsx:79-82`, `StormWatch.jsx:138`.
- Location button heuristic / silent fallback: `HeaderControls.jsx:72`, `useLocation.js:574`.
- Saved/startup controls: `SavedCitiesStrip.jsx`, `DisplaySettingsControls.jsx:139`.
- Trust footer / source health: `DataTrustFooter.jsx`, `SourceHealthPanel.jsx`, `WeatherDashboard.jsx:257-290`.
- README product promise vs. render: `README.md` "Demo Expectations" (hero summarizes rain gear / UV / wind).
</content>
</invoke>
