# Spec — Rain Push Alerts (Supabase)

**Status:** Draft for review
**Audience:** Primary user is a rain-focused daily user (the owner's husband), on an installed iPhone PWA.
**One-liner:** Let Aura watch the forecast for the user's saved locations and push a notification when rain (or a storm, or a chosen condition) is coming — even when the app is closed.

---

## 1. Why this needs a backend

The current app is frontend-only; it can only check the weather *while open*. Push notifications that fire when the app is closed require a server to (1) store push subscriptions, (2) run a schedule that evaluates the forecast, and (3) send the push. Supabase covers all three: Postgres + Auth + Edge Functions (Deno) + `pg_cron` + secrets.

## 2. Goals / non-goals

**Goals**
- Notify the user before/when rain is likely at a saved location, while the app is closed.
- Reuse the app's existing rain logic and thresholds so an alert never contradicts what the dashboard shows.
- Stay honest (the trust contract): never fire an alert from missing/guessed data; never spam.

**Non-goals (v1)**
- Background *device* geolocation alerts ("rain wherever I am right now") — iOS restricts background geolocation; saved locations only for v1.
- Non-US severe alerts (NOAA/NWS is US-only, same constraint as today).
- Android-parity polish; iOS installed PWA is the primary target.

## 3. Architecture

```
Client PWA                         Supabase
----------                         --------
Settings UI ── subscribe ───────▶  push_subscriptions  (RLS: own rows)
              + alert rules ─────▶  alert_rules         (RLS: own rows)

Service Worker ◀── Web Push ─────  Edge Function: check-rain-alerts
  push → showNotification              ▲   (runs every 15 min via pg_cron)
                                       └── reads rules, fetches Open-Meteo /
                                           NWS, evaluates, sends VAPID push,
                                           logs to alert_deliveries (dedupe)
```

- **Web Push transport:** VAPID (Voluntary Application Server Identification). Public key ships to the client; private key is an Edge Function secret.
- **Scheduler:** `pg_cron` triggers the Edge Function on an interval (via `pg_net`/scheduled invocation).
- **Auth:** Supabase Auth with **Sign in with Apple** (best fit for an iPhone PWA) or magic-link email. Subscriptions and rules are scoped to `auth.uid()`. (A lighter "anonymous device id" mode is possible for v1 — see Open decisions.)

## 4. Data model

```sql
create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table alert_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  location_lat  double precision not null,
  location_lon  double precision not null,
  location_name text not null,
  type          text not null check (type in
                  ('rain_incoming','daily_rain','severe','morning_brief')),
  -- thresholds (nullable per type)
  min_probability integer,        -- rain_incoming, e.g. 50 (%)
  min_amount_in   numeric,        -- daily_rain, e.g. 0.1 (in)
  lead_time_min   integer,        -- rain_incoming, e.g. 20
  brief_hour      integer,        -- morning_brief, local hour 0-23
  timezone        text,           -- IANA tz for quiet hours / brief time
  quiet_start     integer,        -- local hour, inclusive
  quiet_end       integer,        -- local hour, exclusive
  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);

create table alert_deliveries (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid references alert_rules (id) on delete cascade,
  dedupe_key  text not null,      -- e.g. "<rule_id>:<event-window-start>"
  sent_at     timestamptz not null default now(),
  payload     jsonb,
  unique (rule_id, dedupe_key)    -- the cooldown / no-spam guarantee
);
```

RLS: `user_id = auth.uid()` on `push_subscriptions` and `alert_rules`. `alert_deliveries` is service-role only.

## 5. Edge Function: `check-rain-alerts` (every 15 min)

1. Service-role read of all `enabled` rules joined to `enabled` subscriptions.
2. **Group rules by rounded `(lat,lon)`** so each location's Open-Meteo call happens once per run (rate-friendly).
3. For each location, fetch `minutely_15` (precip probability/amount), `daily`, and — for `severe` — `api.weather.gov/alerts/active`.
4. Evaluate each rule:
   - `rain_incoming`: peak `precipitation_probability` within the next `lead_time_min` ≥ `min_probability`.
   - `daily_rain`: today's `precipitation_sum` ≥ `min_amount_in`.
   - `severe`: any active NWS alert (US only; honest "not covered" elsewhere — just don't fire).
   - `morning_brief`: current local hour == `brief_hour` (±7 min of the run).
5. **Guards (trust + no-spam):**
   - Skip if the driving field is missing (`null`) — never fire on absent data.
   - Skip if inside quiet hours.
   - Compute a `dedupe_key` per event window (e.g. the rain onset 15-min bucket); insert into `alert_deliveries` — a unique-constraint conflict means "already told them," so skip.
6. Send Web Push (VAPID) to each of the user's subscriptions with `{ title, body, url, tag }`.
   - `url` is an Aura deep link (`/?lat&lon&name`) so tapping opens that location.
   - On HTTP `404/410` (expired), disable/delete the subscription.
7. Insert the delivery row.

**Reuse:** port the pure `analyzeNowcast` / rain-threshold logic from `src/components/nowcast/analyzeNowcast.js` into a shared Deno module so server alerts and the on-screen nowcast agree exactly (one source of truth for "rain likely").

## 6. Client flow

1. **Settings UI** (new "Rain alerts" panel): master toggle, per-location toggles, alert types, lead time, quiet hours.
2. On enable (must be a user gesture): `Notification.requestPermission()` → if granted, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID_PUBLIC> })`.
3. `supabase.from('push_subscriptions').upsert(...)` and `alert_rules` writes (RLS-scoped).
4. **Service worker** (extend the existing `public/sw.js`):
   - `push` → `self.registration.showNotification(title, { body, icon, badge, tag, data:{ url } })`.
   - `notificationclick` → focus an open Aura tab or `clients.openWindow(url)`.
5. A "send test notification" button so he can confirm it works on his phone.

## 7. iOS specifics (the primary target)

- Web Push on iOS requires the PWA be **installed to the home screen** (iOS 16.4+). He already runs it that way ✓.
- Permission must be requested from a **user gesture** (the toggle tap).
- Provide `icon` (192px) and `badge` (monochrome) — the manifest already ships icons.

## 8. Security & cost

- VAPID private key + Supabase service-role key live only in Edge Function secrets.
- RLS keeps each user to their own rows; the cron function uses service role.
- **Cost:** Supabase free tier (500k Edge Function calls/mo, pg_cron, ample DB), Open-Meteo free, Web Push free → effectively $0 for personal/family use. A 15-min cron over a handful of locations is trivial load.

## 9. Phasing

- **MVP:** one alert type — `rain_incoming` (peak ≥ 50% in next ~2h) on saved locations, fixed 15-min cron, quiet hours optional, anonymous-device auth, a test-notification button. Proves the full pipe end-to-end.
- **v2:** account login (Sign in with Apple) + sync, configurable thresholds/types, morning brief, severe-weather push, delivery history ("why did I get this").

## 10. Open decisions

1. **Auth for v1:** proper Sign in with Apple (syncs, but more setup) vs. anonymous device id (faster, single-device). Recommend anonymous device id for MVP, add Apple sign-in in v2.
2. **Alert types in MVP:** just `rain_incoming`, or also `severe`?
3. **Cron cadence:** 15 min is a good rain-lead balance; tighten to 10 if onset accuracy matters more than invocation count.
4. **Logic reuse:** port `analyzeNowcast` to Deno (preferred, keeps parity) vs. a simpler server-side recompute.

## 11. Rough effort

MVP ≈ a few focused days: extend `sw.js` (push + click), the subscribe flow + settings panel, one Supabase project (2 tables + RLS), the `check-rain-alerts` Edge Function + VAPID + cron, and a test button. v2 (auth/sync + more types) is a second, larger increment.
