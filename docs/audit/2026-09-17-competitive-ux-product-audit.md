# Aura Weather — Competitive UX & Product Audit

**Date:** 2026-09-17
**Scope:** Aura Weather vs. The Weather Channel (weather.com + iOS app), AccuWeather (accuweather.com + iOS app), MyRadar (myradar.com + apps).
**Type:** Findings and recommendations only. No source changes are made by this document.
**Question it answers:** What should Aura improve, add, simplify, or differentiate to be competitive with major consumer weather products while staying cleaner and more focused?

---

## Evidence conventions

Every factual claim below carries its source inline:

| Label | Meaning |
| --- | --- |
| `[read: path:line]` | Read from this repository at this commit, this session. |
| `[docs: url]` | Fetched from that URL this session. |
| `[third-party]` | Aggregated review/press reporting, not first-party product inspection. |
| `[recommendation]` | Product judgment derived from the evidence, not a fact about a product. |
| `[UNVERIFIED]` | Could not be checked this session. Treat as an open question. |

**A note on access limits, stated plainly.** `weather.com/weather/today/l/...` returned HTTP 404 and `accuweather.com/en/us/chicago/...` returned HTTP 403 to automated fetching this session, so the deep per-page web experiences of TWC and AccuWeather were **not** inspected directly. What was inspected: the weather.com homepage `[docs: https://weather.com/]`, both accessibility statements, both iOS App Store listings, AccuWeather's own MinuteCast press material, MyRadar's marketing site, and MyRadar's support documentation. Feature claims below are sourced to those. UX-density claims about the competitor *web* experiences are labelled `[third-party]` and should be re-verified by hand before being quoted anywhere public.

---

## 1. Executive summary

Aura is not behind on data. It is behind on **coverage breadth** and ahead on **honesty**, and it has one unexploited asset that none of the three competitors have any incentive to build.

Aura already carries: current conditions with feels-like, dew point, pressure, visibility, cloud cover, gusts and wind direction; an hourly series that additionally includes CAPE and UV; a 7-day daily series with sunrise/sunset, UV max, rain probability and amount, gust max and dominant direction; and a native 15-minute nowcast series `[read: src/api/types.js:29-89]`. That is a richer *base model* than the free tier of any competitor exposes in one screen. It also carries a precipitation radar with a scrubbable timeline `[read: src/components/radar/RadarPanel.jsx]`, NWS severe alerts with severity+urgency priority scoring `[read: src/api/openMeteo.js:362-407]`, a PWA offline shell, and optional Supabase-backed rain push alerts `[read: docs/rain-push-alerts-spec.md]`.

What it lacks against competitors is narrow and specific: **extended forecast beyond 7 days, map layers beyond precipitation, air-quality depth, pollen, moon data, and non-US alert coverage.** Most of that list is *not* worth building.

The real finding is this. All three competitors monetise attention. weather.com's homepage carries ad slots above the fold, inside the forecast, below the map and in the footer `[docs: https://weather.com/]`; AccuWeather draws the heaviest ad-density complaint volume in 2025–26 review aggregation, including "Had to scroll past 4 ads to see tomorrow" `[third-party: https://unstar.app/blog/weather-apps-ranked-by-user-complaints-2026]`; MyRadar gates temperature maps, aviation data, hurricane cones and pro radar behind Premium `[third-party: search aggregation of MyRadar Premium feature lists]`. An ad-funded product **cannot** prioritise answering your question fastest, because a fast answer is a short session. That is a structural weakness, not a design oversight, and it is the one gap a portfolio app can exploit permanently.

Aura's existing engineering asset makes the exploit concrete. `weatherSnapshotCache.js` already persists the last successful forecast per coordinate with schema and version guards `[read: src/services/weatherSnapshotCache.js:3-10,181-220]`. That is the substrate for **forecast change detection** — "rain probability for this afternoon went up since this morning" — which no mainstream consumer weather product surfaces, and which is the single highest-value differentiator available to Aura. It requires no new provider, no new API key, and no new dependency.

One defect found along the way outranks everything else in urgency. Aura's alert card renders only the event name, one headline line, a priority badge and an expiry time; the NWS `description` is normalised but never read by any component, and NWS's `instruction` field — the protective action — is never normalised at all `[read: src/api/openMeteo.js:390-407; src/components/AlertsCard.jsx:140-172]`. On an active tornado warning, Aura discards the sentence that tells the user what to do. Details in §5; it leads the recommended milestone in §17.

**One-line verdict:** Aura should fix the severe-weather omission immediately, then stop chasing feature breadth, spend its next cycle on a unified decision timeline plus forecast-change detection, and treat "we tell you what changed and what to do, without ads, without a paywall, and without pretending to know what we don't" as the product.

---

## 2. Competitive feature matrix

Legend for the Aura column: ✅ shipped · 🟨 partial · ❌ absent.
Competitor columns record what the cited source advertises; a blank is "not evidenced in the sources inspected", not "absent".

### 2.1 Core weather information

| Capability | Aura | Weather Channel | AccuWeather | MyRadar | Opportunity |
| --- | --- | --- | --- | --- | --- |
| Current conditions | ✅ `[read: src/api/types.js:31-45]` | ✅ | ✅ | ✅ | Competitive |
| Hourly forecast | ✅ 24h rendered, 72h fetched `[read: src/api/openMeteo.js:FORECAST_HOURS=72]` | ✅ | ✅ 10-day hourly `[docs: App Store]` | ✅ | Competitive |
| Daily forecast | ✅ 7 days `[read: src/components/ForecastCard.jsx:171]` | ✅ 15 days `[docs: App Store]` | ✅ 90 days `[docs: App Store]` | ✅ | Needs improvement (10 days) |
| Extended (>15 day) | ❌ | ❌ | ✅ 90-day | ❌ | **Not worth implementing** |
| Feels-like | ✅ `[read: src/api/types.js:35]` | ✅ | ✅ RealFeel® + RealFeel Shade™ `[docs: App Store]` | 🟨 | Needs improvement (explain it) |
| Precipitation probability | ✅ hourly + daily + 15-min `[read: src/api/types.js:56,76,84]` | ✅ | ✅ | ✅ | Competitive |
| Precipitation amount | ✅ `[read: src/api/types.js:57,77]` | ✅ | ✅ | ✅ "patented precipitation models" `[docs: myradar.com]` | Competitive |
| Wind speed + direction | ✅ `[read: src/api/types.js:38-40]` | ✅ | ✅ | ✅ Winds layer `[docs: acmeaom.freshdesk.com]` | Competitive |
| Wind gusts | ✅ current + hourly + daily max `[read: src/api/types.js:39,60,79]` | ✅ | ✅ | 🟨 | Competitive |
| Humidity | ✅ `[read: src/api/types.js:34]` | ✅ `[docs: App Store]` | ✅ | 🟨 | Competitive |
| Dew point | ✅ `[read: src/api/types.js:42]` | 🟨 | ✅ | ❌ | **Potential differentiator** (comfort framing) |
| Visibility | ✅ metres at boundary `[read: src/api/types.js:44, types.js:6-11]` | 🟨 | ✅ | 🟨 | Competitive |
| Pressure | ✅ + trend `[read: src/domain/meteorology.js:56]` | 🟨 | ✅ | ✅ frontal boundaries `[third-party]` | Competitive |
| UV index | ✅ hourly + daily max + hero panel `[read: src/api/types.js:64,78; HeroCard.jsx:423]` | ✅ `[docs: App Store]` | ✅ + AccuLumen Brightness Index™ `[docs: App Store]` | ❌ | Competitive |
| Sunrise / sunset | ✅ `[read: src/api/types.js:74-75]` | ✅ | ✅ | ❌ | Competitive |
| Moon phase / moonrise | ❌ | ✅ | ✅ | ❌ | **Not worth implementing** |
| Air quality | 🟨 single `us_aqi` number, no pollutants, no forecast `[read: src/api/openMeteo.js:560-565]` | ✅ AQI **forecast** `[docs: App Store]` | ✅ | ✅ air quality layer `[third-party]` | Needs improvement |
| Pollen / allergy | ❌ | ✅ pollen count `[docs: App Store]` | ✅ 17 health indicators `[docs: App Store]` | ❌ | **Not worth implementing** (see §10) |
| Weather alerts | ✅ US only `[read: src/api/openMeteo.js:26; README Known Limitations]` | ✅ | ✅ AccuWeather Alerts™ | ✅ NOAA subscribe `[docs: myradar.com]` | Needs improvement (non-US) |
| Severe warnings w/ severity | ✅ severity+urgency score `[read: src/api/openMeteo.js:362-407]` | ✅ | ✅ | ✅ Warnings And Watches layer `[docs: freshdesk]` | Competitive |
| Alert protective-action text | ❌ `description` unrendered, `instruction` unparsed `[read: src/api/openMeteo.js:390-407]` | ✅ | ✅ | 🟨 | **Missing — P0 (§5)** |
| Lightning | ❌ | ✅ `[docs: App Store]` | ✅ Lightning Network™ + proximity notifications `[docs: App Store]` | 🟨 | Needs improvement (see §4) |
| Winter / snow accumulation | 🟨 snow in radar colour scheme only `[read: src/domain/radar.js:18]` | ✅ SnowCast brand | ✅ WinterCast® `[docs: App Store]` | 🟨 | Potential differentiator (seasonal) |

### 2.2 Radar and maps

| Capability | Aura | Weather Channel | AccuWeather | MyRadar | Opportunity |
| --- | --- | --- | --- | --- | --- |
| Live radar | ✅ RainViewer `[read: src/api/rainviewer.js:27]` | ✅ | ✅ | ✅ core product | Competitive |
| Radar animation / timeline | ✅ scrubbable `[read: src/components/radar/RadarTimeline.jsx]` | ✅ | ✅ | ✅ | Competitive |
| Future radar | 🟨 RainViewer nowcast frames, tagged distinctly, "frequently empty" on free tier `[read: src/api/rainviewer.js:8-18]` | ✅ 24-Hour Future Radar `[docs: App Store]` | ✅ | ✅ Forecast layer `[docs: freshdesk]` | Needs improvement |
| Temperature layer | ❌ | ✅ | ✅ | ✅ (Premium) `[docs: myradar.com]` | Not worth implementing |
| Wind layer | ❌ | ✅ | ✅ | ✅ surface + jetstream `[third-party]` | Not worth implementing |
| Cloud / satellite | ❌ | ✅ | ✅ | ✅ Clouds layer `[docs: freshdesk]` | Not worth implementing |
| Lightning overlay | ❌ | ✅ | ✅ | 🟨 | Not worth implementing |
| Severe-weather overlay on map | ❌ alerts are a separate card | ✅ | ✅ | ✅ Warnings And Watches `[docs: freshdesk]` | **Missing — build it** |
| Hurricane / tropical | ❌ | ✅ | ✅ Hurricane Center | ✅ + NHC cone (Premium) `[docs: myradar.com]` | Not worth implementing |
| Wildfire / smoke | ❌ | 🟨 | 🟨 | ✅ wildfires layer `[docs: myradar.com]` | Not worth implementing |
| Aviation (AIRMET/SIGMET) | ❌ | ❌ | ❌ | ✅ `[docs: myradar.com]` | Not worth implementing |
| Earthquakes | ❌ | ❌ | ❌ | ✅ `[docs: myradar.com]` | Not worth implementing |
| Map zoom ceiling | 🟨 z7 free tier `[read: src/domain/radar.js:19]` | ✅ | ✅ | ✅ station-level (Premium) | Needs improvement (document it) |
| Honest empty/no-coverage state | ✅ permanent legend caption; refuses to fake a "no coverage" state it cannot derive `[read: src/api/rainviewer.js:48-59]` | ❌ `[UNVERIFIED]` | ❌ `[UNVERIFIED]` | ❌ `[UNVERIFIED]` | **Differentiator (already shipped)** |

### 2.3 Personalisation, platform, trust

| Capability | Aura | Weather Channel | AccuWeather | MyRadar | Opportunity |
| --- | --- | --- | --- | --- | --- |
| Saved locations | ✅ + reorder + startup city `[read: README.md Feature Snapshot]` | ✅ | ✅ | ✅ multi-location `[docs: myradar.com]` | Competitive |
| Current-location weather | ✅ opt-in, 5 s fallback `[read: README Known Limitations]` | ✅ | ✅ | ✅ | Competitive |
| Home / Work labels | ❌ | ✅ `[UNVERIFIED]` | ✅ `[UNVERIFIED]` | ❌ | Not worth implementing |
| Rain push notifications | ✅ Supabase + VAPID, saved locations only `[read: docs/rain-push-alerts-spec.md:3,17-19]` | ✅ | ✅ | ✅ | Competitive |
| Severe push notifications | ✅ rule type `severe` `[read: docs/rain-push-alerts-spec.md §4]` | ✅ | ✅ + lightning proximity `[docs: App Store]` | ✅ | Competitive |
| Custom notification thresholds | ✅ `min_probability`, `min_amount_in`, `lead_time_min`, quiet hours `[read: docs/rain-push-alerts-spec.md §4]` | 🟨 | 🟨 | ✅ webhooks (Premium) `[third-party]` | **Differentiator (already shipped)** |
| Unit preference | 🟨 °F/°C only `[read: src/hooks/useDisplayPreferences.js:3,25-32]` | ✅ | ✅ | ✅ | Needs improvement (wind/pressure/precip) |
| Accessibility preferences | 🟨 honours `prefers-reduced-motion` / `prefers-reduced-data`; no in-app control `[read: README Accessibility Notes; src/hooks/usePrefersReducedData.js]` | ❌ `[UNVERIFIED]` | ❌ overlay widget on corporate site only `[docs: corporate.accuweather.com/accessibility-statement/]` | ❌ `[UNVERIFIED]` | **Potential differentiator** |
| Advertising | ❌ none | ✅ ad slots throughout `[docs: https://weather.com/]`; ad-free $1.99/mo `[docs: App Store]` | ✅ `[docs: App Store]` | ✅ (removed by Premium) `[third-party]` | **Structural differentiator** |
| Paywall | ❌ none | ✅ $4.99/mo, $29.99/yr `[docs: App Store]` | ✅ Premium $1.99/mo, Premium+ $4.99/mo `[docs: App Store]` | ✅ | **Structural differentiator** |
| Offline behaviour | ✅ SW app shell + last-known forecast, labelled `[read: public/sw.js; src/services/weatherSnapshotCache.js]` | 🟨 `[UNVERIFIED]` | 🟨 `[UNVERIFIED]` | 🟨 `[UNVERIFIED]` | **Differentiator (already shipped)** |
| Missing-data honesty | ✅ four-layer contract + tests `[read: README Data Trust Contract]` | ❌ `[UNVERIFIED]` | ❌ `[UNVERIFIED]` | ❌ `[UNVERIFIED]` | **Differentiator (already shipped)** |

---

## 3. UX comparison

### The Weather Channel (weather.com)

The homepage leads with current conditions (temperature, Feels Like, high/low, Chance of Rain), then a **"Today's Outlook"** block of editorial trending topics — Hurricane Season, El Niño, Tornadoes, Fall Outlook, Health & Wellness — then a "Next 10 Days" link. Navigation is thin at the top level: Today, Radar, and a "More" overflow, plus sign-in and a premium upsell. Ad slots appear above the main content, inside the forecast section, below the map, and in the footer `[docs: https://weather.com/]`.

The structural read: **weather.com is a media property wearing a forecast as a hat.** The editorial block sits between "what is it doing now" and "what will it do for the next ten days" — precisely where a forecast product would put the hourly timeline. That placement is a monetisation decision, and it is the clearest single thing Aura should refuse to imitate.

### AccuWeather

Not directly inspectable this session (HTTP 403). What is verifiable is the feature vocabulary, which is unusually branded: **MinuteCast®**, **RealFeel®**, **RealFeel Shade™**, **AccuWeather Alerts™**, **Lightning Network™**, **WinterCast®**, **AccuLumen Brightness Index™** `[docs: https://apps.apple.com/us/app/accuweather-weather-radar/id300048137]`.

Two readings of that, both true. The generous one: AccuWeather has done the hardest work in the category, which is **naming derived metrics so a non-expert can act on them**. "RealFeel Shade" answers a question a raw dew point never will. The critical one: seven trademarks is a lot of proprietary vocabulary to teach, and 17 health indicators `[docs: App Store]` is past the point where a user can hold the model in their head. Ad-density complaints in 2025–26 aggregation are heaviest for AccuWeather among major weather apps `[third-party: https://unstar.app/blog/weather-apps-ranked-by-user-complaints-2026]`.

### MyRadar

Map-first. The product *is* the map, and the forecast is a secondary panel. Layers documented in its own support material: Radar Type, Forecast, Winds, Temperature Layer, Clouds, Warnings And Watches, Next Day Outlooks, Photos, Aviation Layers, Storm Chasers `[docs: https://acmeaom.freshdesk.com/support/solutions/folders/44000958385]`, plus hurricanes, earthquakes, wildfires and flight tracking from the marketing site `[docs: https://www.myradar.com/]`.

MyRadar is the clearest product of the three: it knows it sells one thing. Its weakness is the inverse of weather.com's — it is excellent at *where* and weak at *what should I do*. It also pushes a large share of its map value behind Premium, including the temperature layer and the hurricane cone `[third-party]`.

### Aura, honestly

Aura's dashboard is a single scrolling column of tiered bento groups: Alerts → Hero → Hourly → Radar ("Right now") → Nowcast (Next 2 hours) → Precipitation Outlook (Rest of today) → Storm Watch → Week Ahead → Atmosphere → Rain Alerts → Source Health `[read: src/components/layout/WeatherDashboard.jsx:145-345; src/components/layout/SupplementalWeatherPanels.jsx:22-90]`.

The tiering is real and deliberate — group labels carry `data-tier="act-now"` and the ambient Atmosphere panel is placed last on purpose `[read: src/components/layout/SupplementalWeatherPanels.jsx:8-11]`. That is genuinely better information architecture than a flat card grid.

The remaining problem is **precipitation is narrated by four surfaces in a row**: Nowcast (next 2 h), Precipitation Outlook (rest of today), Storm Watch (peak window), Week Ahead (daily rain %) — plus the Hourly card's Precipitation tab and the radar. A prior internal audit flagged this at six surfaces `[read: docs/product-ux-audit.md §2.2]`; the tiering has improved the ordering but not reduced the count. This is the strongest argument for §12's unified timeline: it is a **consolidation**, not an addition.

---

## 4. Radar and maps comparison

| Dimension | Aura | MyRadar | TWC | AccuWeather |
| --- | --- | --- | --- | --- |
| Primary role | Supporting panel | The product | Supporting tab | Supporting tab |
| Observed precipitation | ✅ | ✅ | ✅ | ✅ |
| Forecast frames | 🟨 tagged, often empty on free tier | ✅ | ✅ 24h future radar | ✅ |
| Layer count | 1 | 10+ | Multiple | Multiple |
| Alerts drawn on map | ❌ | ✅ | ✅ | ✅ |
| Zoom ceiling | z7 | station-level (Premium) | High | High |
| Loads without blocking first paint | ✅ lazy, 2000 ms idle deadline `[read: README Architecture Decisions]` | N/A (map is the app) | `[UNVERIFIED]` | `[UNVERIFIED]` |

**What Aura should build:** one thing. **Draw active NWS alert polygons on the existing Leaflet map.** Aura already fetches NWS alerts and already runs Leaflet; the alert GeoJSON carries geometry. This is the one map capability that changes a user's answer to a question they actually have — *is the warning over me?* — and it closes the single largest severe-weather gap in §5. `[recommendation]`

**What Aura should not build:** temperature, wind, cloud/satellite, lightning, tropical, wildfire, aviation and earthquake layers. Each adds a tile source, a legend, a control, a loading state and a failure state, and none of them changes what a commuter in Chicago does in the next four hours. MyRadar wins that fight on depth and has an aviation audience Aura does not have. Competing there is how a focused product becomes an unfocused one. `[recommendation]`

**What Aura should document rather than fix:** the z7 zoom ceiling and the free-tier nowcast-frame scarcity are RainViewer tier facts, not bugs `[read: src/domain/radar.js:19; src/api/rainviewer.js:8-13]`. The legend's permanent "a clear map may mean no coverage" caption is already the right answer and is, as far as this audit can tell, more honest than anything the three competitors ship `[read: src/api/rainviewer.js:48-59]`.

---

## 5. Severe-weather comparison

The five questions a severe-weather UI must answer, scored against each product:

| Question | Aura | TWC | AccuWeather | MyRadar |
| --- | --- | --- | --- | --- |
| What is happening? | ✅ NWS event name + headline | ✅ | ✅ | ✅ |
| Where is it happening? | ❌ **no map geometry** | ✅ | ✅ | ✅ |
| When will it affect me? | 🟨 expiry time in the location's zone `[read: src/components/AlertsCard.jsx:10-22]`; no onset countdown | ✅ | ✅ | ✅ |
| How serious is it? | ✅ severity + urgency → priority `[read: src/api/openMeteo.js:362-407]` | ✅ | ✅ | ✅ |
| What next? | ❌ **no protective-action text at all** — see below | ✅ | ✅ | 🟨 |

**Finding: the alert card drops NWS's safety instructions.** `AlertsCard` renders exactly four fields per alert — `event`, `headline`, `priority`, and "Until {endsAt}" `[read: src/components/AlertsCard.jsx:140-172]`. The API layer normalises `description` `[read: src/api/openMeteo.js:406]` but **no component reads it** (grep for `alert.description` across `src/components/` and `src/hooks/` returns nothing). NWS's `instruction` field — the "take shelter now / move to an interior room" text, which is the single most actionable string in a severe-weather payload — is **not normalised at all** `[read: src/api/openMeteo.js:390-407]`.

So on an active tornado warning, Aura today shows the event name, one headline line, a priority badge and an expiry time, and discards the protective action. That is the most consequential gap in this audit. It is also among the cheapest to close: one field added to the normaliser, one disclosure added to the card.

**Aura's severe-weather strengths, verified.** It renders at most four alerts and states the overflow count rather than silently truncating `[read: src/components/AlertsCard.jsx:23,54]`. It filters expired alerts at render time as defence-in-depth even though the restore path already drops them — "this card is the surface where being wrong is most costly" `[read: src/components/AlertsCard.jsx:36-56]`. It formats expiry in the **alerted location's** timezone, not the reader's, after a bug where a Chicago tornado warning read six hours off to a viewer in London `[read: src/components/AlertsCard.jsx:10-16]`. And an unsupported region gets "Alerts unavailable for this region" rather than an ambiguous silence `[read: src/components/AlertsCard.jsx:70-78; src/api/openMeteo.js ALERTS_STATUS]`.

That last one deserves emphasis: **a false all-clear is the worst possible failure in a weather app**, and Aura is the only one of the four where the audit can point at the code that prevents it.

**Aura's severe-weather gaps, ranked.**

1. **No geometry.** The user cannot see whether the polygon covers them. This is P0. `[recommendation]`
2. **No protective-action text.** `description` is normalised and never rendered; `instruction` is never normalised `[read: src/api/openMeteo.js:390-407; src/components/AlertsCard.jsx:140-172]`. This is P0. `[recommendation]`
3. **No onset framing.** The card shows when an alert *expires*, not when it *starts* or how long until impact. "Expires 9:45 PM" does not answer "when will it affect me?" `[read: src/components/AlertsCard.jsx:10-22]` `[recommendation]`
4. **Four competing severity vocabularies.** NWS priorities (alerts), "High/Moderate/Low immediate risk" (Nowcast), "Risk level N of 4" (Storm Watch, on a CAPE 0–4000 J/kg scale `[read: src/components/StormWatch.jsx:25]`), and the hero's tone words. A user cannot rank "Moderate immediate risk" against "Level 2 of 4". This was flagged in the June audit `[read: docs/product-ux-audit.md §2.3]` and the vocabularies still differ. `[recommendation]`
5. **US-only.** Structural, and correctly disclosed. Leave it. `[read: README Known Limitations]`

---

## 6. Forecast experience comparison

How fast can a user answer the eight everyday questions?

| Question | Aura today | Best competitor answer |
| --- | --- | --- |
| Do I need a jacket? | 🟨 Hero guidance renders rain/sun/wind advice but deliberately renders nothing on a mild day `[read: src/components/HeroCard.jsx:380-392]` | AccuWeather RealFeel® / RealFeel Shade™ |
| Will it rain when I leave? | ❌ requires reading Nowcast + Rain Outlook + Hourly and integrating them | AccuWeather MinuteCast® (2 h free, 4 h extended, refreshed every 5 min) `[docs: accuweather.com press 866154]` |
| What time will rain start? | ✅ Nowcast buckets the start honestly ("within the next half hour") `[read: src/components/nowcast/analyzeNowcast.js:32-63]` | TWC 15-minute rain intensity to 7 hours `[docs: App Store]` |
| When will it stop? | ✅ duration buckets `[read: analyzeNowcast.js:39]` | MinuteCast start+end times |
| How hot will it feel? | ✅ feels-like current + hourly `[read: src/api/types.js:35,63]` | RealFeel with sun/shade split |
| Will conditions be dangerous? | 🟨 four vocabularies, no unified scale | TWC / AccuWeather alerts |
| Is tomorrow better than today? | ❌ **no comparison anywhere** — the user must read two rows and subtract | None do this well either |
| What's the weekend? | 🟨 inside the 7-day list, unlabelled | TWC "Weekend" tab `[UNVERIFIED]` |

**The pattern.** Aura is strong on *precision about the near term* and weak on *comparison and synthesis*. It is excellent at "rain starts within the next half hour, passing quickly" and has literally nothing that says "tomorrow is 12° cooler than today" or "Saturday is the better of the two weekend days."

Notably, **nobody does comparison well.** All four products present days as a list of independent rows and leave the differencing to the reader. That is a genuine, unclaimed gap in the category, and it is cheap to close because the data is already in `daily.temperatureMax` / `temperatureMin` / `rainChanceMax` `[read: src/api/types.js:70-81]`. `[recommendation]`

Aura's 7-day horizon vs AccuWeather's 90-day is not a real gap. A 90-day daily forecast is beyond meteorological skill and functions as a retention feature, not an information feature. Extending Aura to **10 days** matches the consumer convention at near-zero cost; going further would be adopting a competitor's dishonesty. `[recommendation]`

---

## 7. Accessibility comparison

| Dimension | Aura | TWC | AccuWeather | MyRadar |
| --- | --- | --- | --- | --- |
| Stated standard | WCAG 2.1 AA + 2.2 AA asserted **and tested** via axe-core in CI `[read: README Current automated coverage]` | WCAG 2.0 + Section 508, **no level stated** `[docs: weather.com/accessibility-statement]` | WCAG 2.1 — but the statement covers **corporate.accuweather.com only**, not the consumer site `[docs: corporate.accuweather.com/accessibility-statement/]` | `[UNVERIFIED]` |
| Mechanism | Source-level: scoped live regions, `aria-busy`, roving tabindex, focus management `[read: README Accessibility Notes]` | Claims compatibility with screen readers, voice recognition, magnification `[docs: weather.com/accessibility-statement]` | **UserWay overlay widget** + scanner `[docs: corporate.accuweather.com/accessibility-statement/]` | `[UNVERIFIED]` |
| Enforced in CI | ✅ axe-core on `/` and `?mock=missing`, Lighthouse a11y floor 0.95 `[read: README Recent Hardening]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` |
| Missing data announced | ✅ `aria-label="No data available"` instead of speaking "em dash" `[read: README Data Trust Contract layer 4]` | `[UNVERIFIED]` | `[UNVERIFIED]` | `[UNVERIFIED]` |

**This is Aura's strongest verified competitive position, and it is being undersold.**

Two findings worth stating precisely:

- AccuWeather's accessibility statement claims WCAG 2.1 for **corporate.accuweather.com** and is silent on accuweather.com, the site people actually use `[docs: corporate.accuweather.com/accessibility-statement/]`. Its named mechanism is a **UserWay overlay widget** — a bolt-on layer, not remediated source. Overlays are widely regarded in the accessibility community as a weaker approach than fixing the underlying markup `[third-party]`.
- The Weather Channel claims **WCAG 2.0** — one major version behind — and does not state a conformance level `[docs: weather.com/accessibility-statement]`.

Aura tests against 2.1 AA and 2.2 AA in CI. That is not a marketing claim; it is a build gate.

**Accessibility gaps Aura still has** (each a real opportunity, none large):

1. **Colour-only encoding.** The radar uses RainViewer's Universal Blue scheme `[read: src/domain/radar.js:16]`; intensity is conveyed by hue alone. A non-visual or colour-blind user gets nothing from the map. A text summary alongside the radar ("moderate returns approaching from the southwest") would be the first genuinely accessible radar in this comparison set. `[recommendation]`
2. **Chart accessibility.** The hourly card has a keyboard-navigable sample strip with roving tabindex and arrow keys `[read: README Recent Hardening]` — good — but the underlying series has no tabular alternative. A `<table>` behind a disclosure is cheap and complete. `[recommendation]`
3. **No in-app motion or density control.** Aura honours `prefers-reduced-motion` and `prefers-reduced-data` at the OS level `[read: src/hooks/usePrefersReducedData.js]` but offers no in-app override for a user who wants calm on one site only. `[recommendation]`
4. **Dark-only by design.** `color-scheme: dark only` is a deliberate design decision, documented in the markup `[read: index.html:9-16]`. It is defensible — the frosted cards require a dark substrate — but it removes a choice from light-sensitivity and low-vision users. Worth an explicit note in the case study rather than a silent constraint. `[recommendation]`

---

## 8. Competitor strengths and weaknesses

### The Weather Channel

**Does particularly well:** brand trust at a scale nothing else matches (4.8★ across 6M ratings `[docs: App Store]`); genuinely useful near-term precision — 15-minute rain intensity out to 7 hours and 24-Hour Future Radar `[docs: App Store]`; **AQI forecast**, not just current AQI, which is the one feature in its list Aura should straightforwardly copy.

**Aura should learn:** forecast the health metric, don't just report it. A current AQI of 90 tells you nothing about whether the afternoon run is a bad idea. Aura shows a single current `us_aqi` number `[read: src/api/openMeteo.js:560-565]`, and Open-Meteo's air-quality API exposes hourly series and pollutant breakdowns that would make an AQI *outlook* trivial `[docs: https://open-meteo.com/en/docs/air-quality-api]`.

**Aura should avoid:** the editorial content block. weather.com places trending-topic content between current conditions and the ten-day forecast `[docs: https://weather.com/]` — content in the path of the answer. Also avoid the ad-free upsell as a product tier; "no ads" should be Aura's baseline, not its premium.

### AccuWeather

**Does particularly well:** naming derived metrics so laypeople can act — RealFeel®, RealFeel Shade™, MinuteCast®, WinterCast® `[docs: App Store]`. MinuteCast is the strongest single answer to "will it rain when I leave" in the category: 120 minutes standard, 4 hours extended, refreshed every 5 minutes `[docs: accuweather.com press 866154]`.

**Aura should learn:** two things. First, **name the derived value, not the raw one** — "feels like 96°, and 88° in shade" beats "dew point 74°F". Second, MinuteCast's framing. Aura already has a native 15-minute series and already buckets start and duration honestly `[read: src/api/types.js:83-89; analyzeNowcast.js:32-63]` — it has the substance and is missing only the framing and the prominence.

**Aura should avoid:** the 90-day daily forecast (beyond skill, a retention device), 17 health indicators (past the limit of a usable mental model), seven trademarked vocabularies, and the ad load `[third-party]`. Also avoid AccuWeather's accessibility approach — an overlay widget scoped to the corporate site is the opposite of what Aura does.

### MyRadar

**Does particularly well:** clarity of purpose. It is a map product and never pretends otherwise. Layer taxonomy is clean and discoverable `[docs: acmeaom.freshdesk.com]`, and hazard layers (earthquakes, wildfires, hurricanes) are genuinely differentiated.

**Aura should learn:** one idea — **hazards belong on the map**. MyRadar's Warnings And Watches layer `[docs: freshdesk]` is the thing Aura's radar is missing, and it is the difference between "there is a warning for your county" and "the warning covers you."

**Aura should avoid:** everything else about MyRadar's surface area. Aviation AIRMETs, flight tracking, storm-chaser feeds and user photo submission are a different product for a different person. Also avoid its paywall shape — gating the temperature layer and hurricane cone behind Premium `[third-party]` is exactly the "the thing you came for costs extra" pattern Aura should define itself against.

---

## 9. Aura feature gaps

Ranked by *how much the user's ability to understand or act improves*, not by how common the feature is.

| # | Gap | Classification | Why |
| --- | --- | --- | --- |
| 0 | **NWS protective-action text discarded** (`description` normalised but unrendered; `instruction` not normalised) | **Missing** | Blocks "what should I do" on the highest-stakes surface in the app `[read: src/api/openMeteo.js:390-407; src/components/AlertsCard.jsx:140-172]` |
| 1 | Alert polygons not drawn on the radar map | **Missing** | Blocks "where is it happening" — the one question Aura currently cannot answer at all |
| 2 | No "what changed since last time" signal | **Potential differentiator** | Nobody in the category does this; Aura already has the snapshot cache `[read: src/services/weatherSnapshotCache.js:181-220]` |
| 3 | No day-to-day comparison ("tomorrow vs today") | **Potential differentiator** | Data already present in `daily` `[read: src/api/types.js:70-81]`; no competitor does it well |
| 4 | Precipitation narrated by four+ surfaces | **Needs improvement** | Consolidation, not addition; directly serves "cleaner than competitors" |
| 5 | Four competing severity vocabularies | **Needs improvement** | User cannot rank risk across cards |
| 6 | AQI is one current number, no forecast, no pollutants | **Needs improvement** | TWC ships AQI forecast; Open-Meteo already exposes the series `[docs: open-meteo.com air-quality-api]` |
| 7 | Alert onset/countdown missing (expiry only) | **Needs improvement** | Answers "when will it affect me" |
| 8 | 7-day vs 10-day convention | **Needs improvement** | Cheap; matches expectation without adopting 90-day dishonesty |
| 9 | Units limited to °F/°C | **Needs improvement** | Wind, pressure, precipitation units are fixed `[read: src/hooks/useDisplayPreferences.js:3]`; non-US users see mph/inHg/inches |
| 10 | Radar has no non-visual alternative | **Missing** | Accessibility leadership position is incomplete without it |
| 11 | Non-US severe alerts | **Not worth implementing** | Would require per-country integrations; current disclosure is honest |
| 12 | Moon phase, pollen, satellite, lightning, tropical, wildfire, aviation layers | **Not worth implementing** | See §10 |

---

## 10. Features Aura should intentionally NOT implement

Each of these fails the test: *would this meaningfully improve the user's ability to understand or act on weather information?*

| Feature | Why not |
| --- | --- |
| **90-day daily forecast** | Beyond meteorological skill. Shipping it would contradict the trust contract more loudly than any `Number(null)` bug ever did. AccuWeather ships it `[docs: App Store]`; that is a reason to avoid it, not to match it. |
| **Moon phase** | A prior audit correctly identified a permanently-empty Moon tile as the one thing contradicting Aura's "we don't show what we don't have" story `[read: docs/product-ux-audit.md §2.7]`. It has since been removed from the atmosphere panel — verified: no moon tile exists in `AtmosphereBento.jsx`. Do not bring it back. Moon phase is computable, but it changes no decision. |
| **Pollen / allergy indices** | Open-Meteo's pollen data is **Europe-only, in season, 4-day forecast** `[docs: open-meteo.com air-quality-api]`. Aura's severe alerts are already US-only. Shipping a Europe-only health feature on top of a US-only alert feature produces a product where every user is missing something different. |
| **17 health indicators** | AccuWeather's count `[docs: App Store]`. Past the point where a user can hold the model in mind. |
| **Satellite / cloud, temperature, wind, lightning map layers** | Each adds a tile source, legend, control, loading state and failure state. None changes a near-term decision. MyRadar owns this ground. |
| **Aviation (AIRMET/SIGMET), flight tracking, earthquakes, storm chasers** | Different product, different user. `[docs: myradar.com]` |
| **Hurricane / tropical tracking** | Seasonal, regional, and correctness-critical in a way a portfolio app should not casually take on. NHC is authoritative; link, don't reimplement. |
| **Wildfire / smoke** | Same reasoning. High correctness stakes, narrow applicability. |
| **User photo submission, social feeds** | Engagement mechanics, not information. `[docs: myradar.com]` |
| **Ads or a premium tier** | The absence is the positioning. |
| **Home/Work location semantics** | Aura already has four location concepts — Recent, Saved, Synced, Startup `[read: docs/product-ux-audit.md §2.6]`. Adding a fifth increases conceptual load. |
| **An AI-written weather summary** | Tempting and wrong. Every sentence Aura shows should be **derived from the numbers by rules that can be unit-tested**. A generated sentence cannot carry the trust contract, cannot be pinned by a test, and reintroduces exactly the confident-but-wrong failure mode the whole project exists to prevent. `[recommendation]` |

---

## 11. Aura differentiation opportunities

### 11.1 Weather storytelling — verdict: **yes, and Aura is already halfway there**

The brief proposes moving from `72°F · 40% precipitation` to "Comfortable this morning. Rain becomes increasingly likely after 3 PM."

Aura already does a constrained version of this well. The Nowcast produces bucketed, honest sentences and refuses to over-claim resolution — the code comment is explicit that a 15-minute *probability* series does not license a minute-level claim, and that the quarter-hour cadence is not itself a resolution claim because the provider interpolates it in some regions `[read: src/api/openMeteo.js:FORECAST_MINUTELY_15 comment; src/components/nowcast/analyzeNowcast.js:32-63]`. The hero renders rule-derived guidance and deliberately says nothing on a genuinely mild day rather than narrating a non-event `[read: src/components/HeroCard.jsx:380-392]`.

**The gap is scope, not capability.** The storytelling covers the next two hours and today's guidance. It does not cover the arc of the day ("comfortable this morning, then...") or the week. Extending the same rule-derived, bucketed, testable approach to a **day-arc sentence** is the natural next step.

**Constraint that must hold:** rules, not generation. Every sentence must be a pure function of the model, unit-testable, and must degrade to silence rather than to a guess — which is the pattern already established `[read: src/components/heroCard/buildAtmosphereReading.js]`.

### 11.2 Decision support — verdict: **yes, but narrowly**

"Best time to walk / exercise / commute" is the right idea and the wrong framing if it becomes a list of nine widgets. The disciplined version is **one** derived artefact:

> **Best outdoor window today: 9:00–11:30 AM.** Rain chance under 20%, UV below 5, wind under 12 mph.

One sentence, one time range, and the **reasons stated as thresholds** so the user can disagree with it. Aura has every input already: `rainChance`, `uvIndex`, `windSpeed`, `feelsLike`, `temperature` hourly `[read: src/api/types.js:53-67]`, plus `getAqiStatus` / `classifyUv` / `classifyComfort` classifiers `[read: src/domain/exposure.js:30,107; src/domain/meteorology.js:188]`.

Umbrella and jacket recommendations already exist as `dailyGuidance` `[read: src/components/HeroCard.jsx:383]`. Heat risk and UV exposure are covered by the UV panel and comfort classifier. **Do not add separate walk/exercise/commute widgets** — they are the same computation with different thresholds, and three cards where one sentence would do is exactly the clutter Aura is trying to beat. `[recommendation]`

### 11.3 Unified forecast timeline — verdict: **yes, and this is the single best UX investment**

One horizontally-scrollable timeline for the next 24 hours carrying, in one coordinate space:

- temperature line
- precipitation probability bars (with the 50% threshold marked — noting the existing inconsistency where Nowcast and RainCard have used different "likely" thresholds `[read: docs/product-ux-audit.md §2.10]`, which should be unified as part of this work)
- wind speed with gust extent
- a UV band across daylight hours
- **severe-alert time extents as a shaded region**
- sunrise/sunset markers

This does not add information. It **replaces the need to mentally join** the Hourly card, the Nowcast, the Precipitation Outlook and the Storm Watch. That is the consolidation identified in §3 and §9.4, and it is also the strongest engineering artefact in this whole document (see §14). `[recommendation]`

Keep the existing cards as progressive disclosure beneath it; do not delete working surfaces in the same change that introduces their replacement.

### 11.4 Weather change detection — verdict: **yes, this is the differentiator**

**No mainstream consumer weather product surfaces how its own forecast changed.** They all present the current run as if it were the only run there has ever been. That is a category-wide blind spot, and it maps onto the exact question people actually ask: *did this get better or worse since I last looked?*

**Technical feasibility — verified, with a correction worth stating.**

Open-Meteo publishes a **Previous Runs API** with `_previous_day1` … `_previous_day7` variable suffixes, where `_previous_dayN` is the value predicted N×24 hours before valid time, archived from January 2024 for most models `[docs: https://open-meteo.com/en/docs/previous-runs-api]`. That is a real, free, no-key source — but it is **aligned to fixed 24-hour lead offsets and documented for forecast-skill analysis**, not for "since this morning." It answers "how does today's forecast for Saturday differ from yesterday's forecast for Saturday." It does **not** answer "since you last opened the app."

The better mechanism for the app's own question is already in the repo. `weatherSnapshotCache.js` persists the last successful forecast per coordinate, versioned and schema-guarded `[read: src/services/weatherSnapshotCache.js:3-10,181-220]`. Diffing the incoming model against the retained snapshot gives *exactly* "what changed since you last looked," with no new provider, no new key, and no new dependency.

Recommended shape:

- **Source:** the existing snapshot cache for the personal diff. Optionally the Previous Runs API later for a "vs. yesterday's model" view — treat that as P3, not P1.
- **Threshold:** only surface material changes. A 3-point move in rain probability is noise; a move across a decision boundary (below 30% → above 60%, or a high dropping 8°F+) is news.
- **Copy:** state the direction, the magnitude and the *when*. "Rain chance for this afternoon rose from 20% to 65% since your last check (2 h ago)."
- **Honesty:** when there is no prior snapshot, or it is beyond the existing freshness window, say nothing. Never imply a change you cannot evidence. This is the trust contract applied to a new surface.

This is the recommendation with the highest ratio of user value to engineering cost in the entire document, and it is the one a hiring manager will remember.

---

## 12. Top 10 recommended improvements

| # | Improvement | User problem | Competitor evidence | UX benefit | Eng. difficulty | Portfolio value | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | **Render NWS `description` + normalise and render `instruction`** | Aura shows a tornado warning without its safety instructions `[read: src/components/AlertsCard.jsx:140-172]` | TWC, AccuWeather both surface protective actions | Highest-stakes answer the app currently omits | Low | High | 🔴 P0 |
| 1 | **Alert polygons on the radar map** | "Is the warning over *me*?" is unanswerable today | MyRadar Warnings And Watches `[docs: freshdesk]`; TWC; AccuWeather | Turns an abstract warning into a spatial fact | Medium | High | 🔴 P0 |
| 2 | **Unified severity scale** across alerts, nowcast, storm watch | Four vocabularies, no common rank `[read: docs/product-ux-audit.md §2.3]` | All three use one hazard scale | User can finally rank risks | Low | High | 🔴 P0 |
| 3 | **Alert onset + countdown**, not just expiry | "When will it affect me?" unanswered `[read: src/components/AlertsCard.jsx]` | TWC, AccuWeather | Converts a warning into a timeline | Low | Medium | 🔴 P0 |
| 4 | **Forecast change detection** vs last snapshot | Nobody tells you what changed | **None** — category gap | Answers the real returning-user question | Medium | **Exceptional** | 🟢 P2 |
| 5 | **Unified 24-hour decision timeline** | Four precipitation surfaces to mentally join | None unify; MinuteCast is closest `[docs: press 866154]` | Removes cross-card integration work | High | **Exceptional** | 🟡 P1 |
| 6 | **"Best outdoor window today"** (one sentence) | "When should I go out?" | AccuWeather indices approximate it | One actionable answer from six inputs | Medium | High | 🟢 P2 |
| 7 | **Day-comparison line** ("tomorrow: 12° cooler, drier") | Users diff rows by hand | **None do this well** | Makes the 7-day scannable | Low | High | 🟡 P1 |
| 8 | **AQI outlook + pollutant breakdown** | One number, no trend `[read: src/api/openMeteo.js:560-565]` | TWC ships AQI **forecast** `[docs: App Store]` | Health decisions need *when*, not *now* | Low | Medium | 🟡 P1 |
| 9 | **Full unit preferences** (wind, pressure, precip) | °F/°C only `[read: src/hooks/useDisplayPreferences.js:3]` | All three | Makes Aura usable outside the US | Low | Medium | 🟡 P1 |
| 10 | **Accessible radar alternative** (text summary + data table) | Radar is colour-only `[read: src/domain/radar.js:16]` | None do this `[UNVERIFIED]` | First non-visually-accessible radar in the set | Medium | **Exceptional** | 🟢 P2 |

---

## 13. P0–P3 implementation roadmap

### 🔴 P0 — Critical (materially hurts the current experience)

| Improvement | User problem | Competitor evidence | UX benefit | Difficulty | Portfolio value |
| --- | --- | --- | --- | --- | --- |
| **Surface NWS protective-action text** | Warning shown without its safety instructions | TWC, AccuWeather both surface them | Completes "what should I pay attention to next" | Low | High |
| Alert polygons on radar | Cannot tell if a warning covers them | MyRadar, TWC, AccuWeather all draw hazards | Spatial answer to a spatial question | Medium | High |
| Unified severity scale | Four scales, no common rank | All three use one | Cross-card comparability | Low | High |
| Alert onset + time-to-impact | Only expiry is shown | TWC, AccuWeather | Completes the five severe-weather questions | Low | Medium |
| Reconcile the "rain likely" threshold across Nowcast / RainCard / Hourly | Same phrase, different bar `[read: docs/product-ux-audit.md §2.10]` | N/A (internal inconsistency) | Removes a self-contradiction in a trust-first app | Low | Medium |

### 🟡 P1 — Competitive parity

| Improvement | User problem | Competitor evidence | UX benefit | Difficulty | Portfolio value |
| --- | --- | --- | --- | --- | --- |
| Unified 24 h decision timeline | Four precipitation surfaces | MinuteCast, TWC 15-min intensity | One coordinate space, one read | High | Exceptional |
| Day-comparison line in the 7-day | Manual row differencing | None do it well | Turns a list into a narrative | Low | High |
| AQI outlook + pollutants | Current-only AQI | TWC AQI forecast | Health decisions are about *when* | Low | Medium |
| Full unit preferences | °F/°C only | All three | Non-US usability | Low | Medium |
| Extend 7-day → 10-day | Below convention | TWC 15-day, AccuWeather 90-day | Meets expectation without over-claiming | Low | Low |
| Hourly data table (a11y alternative) | Chart is visual-only | None | Completes the accessibility story | Low | High |

### 🟢 P2 — Differentiators

| Improvement | User problem | Competitor evidence | UX benefit | Difficulty | Portfolio value |
| --- | --- | --- | --- | --- | --- |
| **Forecast change detection** | "Did this get better or worse?" | **Category gap** | The returning-user answer nobody gives | Medium | Exceptional |
| "Best outdoor window today" | "When should I go out?" | AccuWeather indices approximate | Six inputs → one answer | Medium | High |
| Accessible radar text summary | Radar is colour-only | None | Category-first | Medium | Exceptional |
| Day-arc storytelling sentence | Hero is silent on mild days by design | None | Gives calm days a narrative without inventing risk | Medium | High |
| In-app motion / density preference | OS-level only | None | Respects per-site preference | Low | Medium |

### ⚪ P3 — Future / experimental

| Improvement | Note |
| --- | --- |
| Previous Runs API "vs. yesterday's model" view | Real and free `[docs: open-meteo.com previous-runs-api]`, but 24 h-aligned and skill-analysis shaped. Only after the snapshot diff ships. |
| Forecast uncertainty from the Ensemble API | Honest uncertainty visualisation fits the trust contract exactly — but it is a hard visualisation problem and easy to make unreadable. `[UNVERIFIED: ensemble API variable coverage not checked this session]` |
| Seasonal winter mode (snow accumulation emphasis) | AccuWeather WinterCast®, TWC SnowCast. Only worth it if Aura's audience is snow-region. |
| Cross-device account sync | Currently per-device by design `[read: README Known Limitations]`. A real account is a large scope increase for modest user value. |
| Widgets / watch surfaces | Platform reach, not information quality. |

---

## 14. Engineering / architecture opportunities

Ranked by how much **case-study material** each generates, not by feature count.

**1. Unified decision timeline — the strongest engineering artefact available.**
One component that renders five independent series (temperature, precipitation probability, wind + gust extent, UV band, alert time extents) in a shared coordinate space, responsive from 360 px to desktop, keyboard-navigable, with a tabular alternative, under `prefers-reduced-motion`, honouring the existing missing-data contract so a null slot becomes a gap and never a zero `[read: README Data Trust Contract layer 2]`. That single component demonstrates: complex data visualisation, scale/axis mathematics, responsive SVG, accessibility of non-text content, performance under animation, and the null-safety contract — simultaneously. **Difficulty: High. Portfolio value: Exceptional.**

**2. Forecast change detection — the strongest *product* engineering story.**
Diffing a persisted prior model against an incoming one requires versioned local persistence (exists `[read: src/services/weatherSnapshotCache.js:10]`), a pure differ, materiality thresholds, and honest degradation when no prior exists. It is a clean demonstration of **caching as a product feature rather than a performance trick**, which is a notably more senior framing than "I added a cache." **Difficulty: Medium. Portfolio value: Exceptional.**

**3. Alert geometry on the map.**
GeoJSON parsing, Leaflet layer management, coordinate validation through the existing `toFiniteNumber` contract `[read: src/utils/numbers.js]`, and a degradation path when an alert carries no geometry — which happens, and must not blank the map. Demonstrates map integration and defensive geospatial handling. **Difficulty: Medium. Portfolio value: High.**

**4. TypeScript — the largest single credibility gap.**
The repo is JavaScript/JSX with JSDoc typedefs and a `tsc` typecheck script `[read: AGENTS.md "It is JavaScript/JSX, not TypeScript"; package.json scripts.typecheck]`. Jenna lists TypeScript as actively improving; the weather domain — a normalised model with ~40 nullable numeric fields `[read: src/api/types.js]` — is close to an ideal teaching case for discriminated unions and `null`-strictness. **A full migration is not recommended as one change.** Converting `src/api/` and `src/domain/` only, leaving components in JSX, would produce a strong incremental-migration story and is honest about scope. **Difficulty: High. Portfolio value: Exceptional.** `[recommendation]`

**5. Accessible data visualisation.**
A chart with a keyboard-navigable focus model *and* a tabular alternative *and* screen-reader summaries is rare enough in commercial products that it is a differentiator on its own. Aura already has the roving-tabindex half `[read: README Recent Hardening]`. **Difficulty: Medium. Portfolio value: Exceptional.**

**Already strong — do not rebuild, but do narrate better:**

- Three independent fetch lifecycles with separate `AbortController` + request-id stale-result guards `[read: README Architecture Decisions]`
- One auto-refresh policy with three triggers routed through a single pure decision function `[read: src/hooks/weatherRefreshPolicy.js]`
- Unit-contract enforcement that throws `UnitContractError` on a provider unit mismatch rather than letting a wrong-unit number through `[read: src/api/types.js:12-18]`
- Timezone correctness resolved per-timestamp through the location's IANA zone rather than the payload's single `utc_offset_seconds` — with DST-transition tests `[read: README Architecture Decisions]`
- Service worker versioned by a hash of the build's own emitted asset filenames, fixing an update lifecycle that byte-identical `sw.js` files had silently broken `[read: vite.config.js:7-24]`
- A doc-number checker that re-derives every count claimed in the README from the repo and fails CI on drift `[read: package.json scripts["check:docs"]]`

That last one is unusual enough to be worth its own paragraph in the case study. Most portfolios have stale READMEs; this one **cannot**.

---

## 15. Portfolio / case-study opportunities

The current case study leads with the data trust contract `[read: docs/case-study.md]`, and that is the right lead — it is specific, it has a named bug class (`Number(null) === 0`), a named fix (`toFiniteNumber`), four enforcement layers and four test layers.

Three additions would strengthen it:

**A. The competitive honesty angle.** This audit supplies a claim Aura can now make with evidence: The Weather Channel's accessibility statement cites **WCAG 2.0 with no conformance level** `[docs: weather.com/accessibility-statement]`; AccuWeather's cites **WCAG 2.1 but only for its corporate site**, remediated via a **UserWay overlay** `[docs: corporate.accuweather.com/accessibility-statement/]`. Aura tests **WCAG 2.1 AA and 2.2 AA in CI with axe-core** `[read: README Current automated coverage]`. Stated factually and sourced, that is a genuinely strong differentiation paragraph.

**B. "Caching as a product feature."** If change detection ships, the snapshot cache stops being a performance optimisation and becomes the thing that answers the user's actual question. That reframing — infrastructure repurposed as product — is a senior-engineer story.

**C. The subtraction narrative.** The most valuable thing in this audit is §10: a list of features Aura is deliberately *not* building, each with a reason. Most portfolio projects demonstrate the ability to add. Very few demonstrate the ability to decline. A case-study section titled "What Aura deliberately doesn't do, and why" would stand out more than any feature.

**Screenshots the case study still lacks:** the alert-overflow state is already captured `[read: docs/screenshots/alert-overflow.png]`; a change-detection state and the unified timeline would be the next two worth capturing once built.

---

## 16. Proposed Aura product positioning

### Core promise

> **Aura helps people decide what to do in the next few hours — and tells them when that answer has changed — better than traditional weather apps.**

Two clauses, both defensible. The first is what every weather app claims and none optimises for, because ad-funded products are not rewarded for fast answers. The second is unclaimed by anyone in the category.

Supporting line, already earned: *"Today's conditions, honest about what it doesn't know."* `[read: README.md:3]`

### Product principles

Derived from this research, not from the examples in the brief.

**1. Answer the question; show the number as evidence.**
A number is the citation, not the answer. "Rain starts within the next half hour" with "62% at 3:15 PM" underneath — never the reverse. Aura's nowcast already works this way; the rest of the app should.

**2. A missing reading is shown as missing. A missing *answer* is shown as silence.**
The existing contract extended to derived guidance. The hero already declines to narrate a non-event `[read: src/components/HeroCard.jsx:380-382]`. Generalise it: when the rules produce nothing, say nothing. Never fill space with a non-answer.

**3. Change outranks state.**
A forecast that moved is more informative than a forecast that held. This is the principle that distinguishes Aura from every competitor and should be treated as load-bearing, not decorative.

**4. Hazard beats everything, and hazard must be located in space and time.**
Severe weather outranks all other content — already true of the alert banner `[read: src/components/layout/WeatherDashboard.jsx:145]` — and an alert is not fully communicated until the user knows *where* it is and *when* it reaches them.

**5. Every added surface must retire one.**
Aura's risk is accretion, not absence: it already narrates precipitation across four surfaces. The timeline earns its place by replacing the need to join them. This principle is the direct competitive response to weather.com's editorial interstitial and AccuWeather's 17 indicators.

**6. Every sentence is a testable function of the data.**
No generated prose. If a claim cannot be pinned by a unit test, it does not ship. This is the trust contract applied to language.

---

## 17. Recommended next development milestone

**Milestone: "Severe weather, located" — the P0 block only.**

Not the timeline, not change detection — those are bigger and better done on a clean base.

**Scope:**

1. Normalise NWS `instruction` alongside the existing `description`, and render both in `AlertsCard` behind a disclosure (the full NWS text is long; the card must stay scannable).
2. Draw active NWS alert polygons on the existing Leaflet radar map, with an honest degradation path when an alert carries no geometry.
3. Add onset time and time-to-impact to `AlertsCard`, alongside the existing expiry.
4. Unify the severity vocabulary across `AlertsCard`, `NowcastCard` and `StormWatch` onto one scale with one badge treatment.
5. Reconcile the "rain likely" probability threshold so the same phrase means the same number everywhere.

**Why this first:**

- It closes the two questions in §5 that Aura currently *cannot* answer — *where is it* and *what should I do*.
- It is the highest-stakes surface in the app, where being unclear has real consequences.
- Item 1 is nearly free and is the highest-consequence omission found in this audit.
- Items 4 and 5 are small, and both remove an internal contradiction in a product whose entire thesis is internal consistency.
- It touches `openMeteo.js`, `RadarPanel.jsx` and `AlertsCard.jsx` but requires **no new provider, no new dependency, and no layout redesign** — which keeps it inside the guardrails in `AGENTS.md` about subjective UI change. Note that `openMeteo.js` and `RadarPanel.jsx` are both listed as risky files in `AGENTS.md`, so each change wants its own narrow commit and test.

**Then, in order:** unified decision timeline (P1, large, the portfolio centrepiece) → forecast change detection (P2, the differentiator) → accessible radar alternative (P2).

**Explicitly deferred:** every map layer beyond alerts, every extended-range forecast beyond 10 days, pollen, moon, and the TypeScript migration — which is worth doing but should not be entangled with feature work.

---

## Open questions (not resolved this session)

1. Direct inspection of the weather.com and accuweather.com **forecast** pages — blocked by 404/403 this session. The UX-density claims about those pages are `[third-party]` and should be hand-verified before public use.
2. Competitor accessibility **behaviour** (as opposed to stated policy) was not tested. Claims in §7 are about published statements only.
3. Open-Meteo Ensemble API variable coverage, for the P3 uncertainty idea. `[UNVERIFIED]`
4. MyRadar Premium pricing — the tier *names* and gated features are sourced, the current prices are not. `[UNVERIFIED]`
5. Whether NWS `instruction` is populated consistently enough across alert types to render unconditionally, or whether the card needs a per-alert presence check. Worth confirming against live `api.weather.gov` payloads before implementing milestone item 1. `[UNVERIFIED]`

---

## Sources

**Repository (read this session):** `package.json`, `AGENTS.md`, `README.md`, `index.html`, `vite.config.js`, `src/api/types.js`, `src/api/openMeteo.js`, `src/api/rainviewer.js`, `src/domain/radar.js`, `src/domain/exposure.js`, `src/domain/meteorology.js`, `src/components/HeroCard.jsx`, `src/components/AlertsCard.jsx`, `src/components/ForecastCard.jsx`, `src/components/HourlyCard.jsx`, `src/components/StormWatch.jsx`, `src/components/AtmosphereBento.jsx`, `src/components/nowcast/analyzeNowcast.js`, `src/components/layout/WeatherDashboard.jsx`, `src/components/layout/SupplementalWeatherPanels.jsx`, `src/hooks/useDisplayPreferences.js`, `src/services/weatherSnapshotCache.js`, `docs/product-ux-audit.md`, `docs/rain-push-alerts-spec.md`, `public/sw.js`.

**External (fetched this session):**

- [MyRadar — product site](https://www.myradar.com/)
- [MyRadar — Features and Layers support documentation](https://acmeaom.freshdesk.com/support/solutions/folders/44000958385)
- [The Weather Channel — iOS App Store listing](https://apps.apple.com/us/app/weather-channel-radar-forecast/id295646461)
- [AccuWeather — iOS App Store listing](https://apps.apple.com/us/app/accuweather-weather-radar/id300048137)
- [weather.com homepage](https://weather.com/)
- [The Weather Channel accessibility statement](https://weather.com/accessibility-statement)
- [AccuWeather corporate accessibility statement](https://corporate.accuweather.com/accessibility-statement/)
- [AccuWeather press — MinuteCast extended from 2 to 4 hours](https://www.accuweather.com/en/press/accuweather-extends-minutecast-from-2-to-4-hours-most-lengthy-most-accurate-minute-by-minute-forecast-available-anywhere-in-the-world/866154)
- [Open-Meteo — Previous Model Runs API](https://open-meteo.com/en/docs/previous-runs-api)
- [Open-Meteo — Air Quality API](https://open-meteo.com/en/docs/air-quality-api)

**Third-party review aggregation:**

- [Weather apps ranked by user complaints, 2026](https://unstar.app/blog/weather-apps-ranked-by-user-complaints-2026)
- [5 weather apps ranked, 2026](https://unstar.app/blog/accuweather-weather-channel-carrot-apple-weather-underground-weather-apps-ranked-2026)
- [AccuWeather reviews — Trustpilot](https://www.trustpilot.com/review/www.accuweather.com)
