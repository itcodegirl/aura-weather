# The severe-alert banner's residual layout shift

**Status:** **decided — accept the residual. No code change.**
**Finding:** Carried from the 2026-09-18 audit as "CLS 0.205"; re-measured and
re-scoped during the 2026-09-20 remediation (PRs #256, #257).
**Written:** 2026-09-21, against `main` at `cf8bb31`.
**Decided:** 2026-09-21 by Jenna Zawaski.

> ## The decision
>
> **Accept the residual. Build none of the three options.**
>
> - The remaining shift is **0.1132**, and it occurs only when an active NWS
>   alert resolves after first paint. Every other path is already under the
>   0.1 "good" threshold — 0.0371 for unsupported coverage, 0.0000 for a US
>   location with no alerts.
> - The reserved-height slot is **refuted by measurement**, not declined on
>   taste. It is worse on both paths.
> - The real-data Playwright assertion, when it is written, **pins the alert
>   fixture's delivery time**. The number is a function of how late the alert
>   lands, so an unpinned fixture measures the harness rather than the app.
> - That assertion does **not** reuse the 0.1 ceiling `#257` added to
>   `config/lighthouse-budgets.json`. That ceiling governs `?mock=missing`
>   under Lighthouse's desktop config, which measures 0.0078. A real-data
>   assertion at 0.1 fails on day one at 0.1132.
> - **Snapshot priming** (§5) is the one option that could remove the shift
>   without cost, and is a future work package rather than a patch. It must
>   keep `isAlertActive` filtering and the Saved labels correct **from frame
>   one** — priming must not resurrect an expired alert, and must not present
>   a restored alert as live.

---

## 1. What happens today

NWS alerts resolve in the supplemental phase, after base weather has been
committed and painted. The banner is then inserted as the **first child** of
`main.bento` — above the `h2` and the hero — so everything below it moves.

The gate is the part that decides every option below:

```jsx
// src/components/layout/WeatherDashboard.jsx:121-123
const hasAlerts = Array.isArray(weather?.alerts) && weather.alerts.length > 0;
const showAlertsPanel =
  hasAlerts || alertsStatus === "unsupported" || alertsStatus === "unavailable";
```

Three of four outcomes render the banner. The fourth — a **successful US
fetch with no active alerts** — renders nothing, and that is the common case
for the app's default location.

`#257` removed a `content-visibility` deferral from `.bento-alerts`, which
was skipping paint on the first element of the page. That took the
unsupported-coverage path from 0.1987 to 0.0371. The active-alert path
improved from 0.1608 to 0.1132 and stayed above the threshold. This record
is about that remainder.

## 2. Measurements

All at 390×844, 4× CPU throttle, alert delivered at +1200ms, Chromium 1194,
`PerformanceObserver` on `layout-shift`, largest session window.

| path | CLS | shifts |
| --- | --- | --- |
| active alert | **0.1132** | 1, source `section.bento-hero` |
| unsupported coverage (all non-US, any NWS outage) | 0.0371 | 1 |
| US, successful fetch, no alerts | **0.0000** | 0 |

**The number is stable, not noisy.** Six consecutive runs of the active-alert
path returned 0.1132 exactly, single shift, same element each time. One
earlier run returned 0.0283 against a cold preview server, with a different
shift source (`hero-sky`) — i.e. the value is a function of *when the alert
lands relative to first paint*, not of measurement jitter. That is the whole
reason §3's assertion has to pin fixture timing.

For reference, the path CI actually measures — `?mock=missing` under
Lighthouse's desktop config, where the banner is present from the first
frame — is **0.0078** against the 0.1 ceiling.

## 3. Options

### A. Move the alerts fetch into the render-blocking phase

The banner would exist at first paint, so nothing inserts above the hero.

- **Fixes:** the shift, completely.
- **Costs:** first paint waits on an `api.weather.gov` round trip, on every
  load, for every user — including the majority for whom the banner never
  renders at all. It also changes the loading contract in
  `useWeatherData.js`, which `AGENTS.md` flags as a risky file.
- **Verdict:** declined. It trades a shift that affects a minority of loads
  for a delay on all of them.

### B. Place the banner after the hero

- **Fixes:** the shift, by inserting below the content rather than above it.
- **Costs:** a severe-weather warning stops being the first thing on the
  page. That is a card-hierarchy decision `AGENTS.md` reserves for human
  design direction, and it is the wrong direction on the merits: the banner
  is first *because* it is the most urgent thing the app can say.
- **Verdict:** declined.

### C. Reserve a fixed-height slot while alerts are pending — **refuted**

Render a placeholder at the banner's height from first paint, release it
when the alerts response lands.

Measured, with the reservation present from first paint (not injected later)
and released atomically in the same frame the banner appears:

| path | today | with a 176px reservation |
| --- | --- | --- |
| active alert | 0.1132 | **0.1383** |
| US, no alerts | **0.0000** | **0.0800** |

Worse on both. Two independent reasons, both traceable to the gate in §1:

1. **On the fourth outcome nothing replaces the reservation.** A US location
   with no alerts never renders a banner, so releasing the slot shifts the
   whole page up — converting a perfect 0.0000 into 0.0800.
2. **No single height fits.** The banner measures ~99px for the
   unavailable/unsupported state and ~176px with one active alert, more with
   several. Whatever is reserved, the mismatch shifts on arrival.

- **Verdict:** refuted by measurement. Recorded here so it is not re-proposed.

### D. Accept the residual — **chosen**

- The shift fires only when an active alert resolves late. In that moment,
  pushing content down to surface a severe-weather warning is the intended
  behaviour, not a defect.
- Every other path is already inside the threshold.
- Nothing is failing: CI does not measure this path, and §3's future
  assertion will carry its own documented threshold.

### E. Prime first paint from the cached snapshot — **future work package**

The app already persists alerts into the snapshot cache and already has
`revalidateRestoredAlerts` for replaying them honestly. A warm start could
render the banner from frame one and shift only when the alert state has
actually *changed* since the last visit — which is rare, and meaningful when
it happens.

Constraints, set with the decision:

- **`isAlertActive` filtering must apply from frame one.** Priming must not
  resurrect an alert whose hazard window has closed. The filter lives in
  `src/domain/alertWindow.js` and is already applied by `AlertsCard.jsx:186`
  and `RadarPanel`; priming is a third caller, not an exception.
- **Saved labels must be correct from frame one.** A primed banner is
  restored data and has to say so. It must never appear as a live reading
  while the live fetch is still open.
- Cold starts still shift. That is once per user, and acceptable.
- It touches `useWeatherData.js`. Its own work package, not a patch.

## 4. What this means for the Playwright assertion

The real-data CLS assertion (roadmap item, not yet written) must:

1. **Pin the alert fixture's delivery time.** 0.1132 is reproducible at
   +1200ms and changes when the alert lands earlier or later. An unpinned
   fixture measures the runner's speed.
2. **Carry its own threshold, documented as the real-data path's**, not the
   0.1 demo-route ceiling from `config/lighthouse-budgets.json`. Reusing that
   ceiling fails immediately at today's accepted 0.1132.
3. Assert the *accepted* number, so the assertion detects regression away
   from a known state rather than enforcing an aspiration.

## 5. Still open

`.bento-radar` keeps a `contain-intrinsic-block-size` of 560px against a
measured 336px, because RainViewer is unreachable from the sandbox and only
the card's failure state could be measured. Re-measure with a working map
before changing it. Unrelated to the banner; recorded so it is not lost.
