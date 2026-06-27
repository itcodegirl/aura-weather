-- Rain push-alerts backend schema (phase 2).
-- Applied to the Supabase project "aura-weather" (ref uyednvctjudnrpheubyv).
-- Identity model: Supabase anonymous sign-ins for the MVP, upgradeable to
-- Sign in with Apple later without a schema change (same auth.users row).

-- Web Push subscriptions, one per device/browser, tied to the auth user.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Per-location, per-type alert rules.
create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location_lat double precision not null,
  location_lon double precision not null,
  location_name text not null,
  type text not null check (type in ('rain_incoming', 'severe', 'morning_brief')),
  min_probability integer,
  lead_time_min integer,
  brief_hour integer,
  timezone text,
  quiet_start integer,
  quiet_end integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Delivery log + dedupe/cooldown guarantee (service-role only).
create table public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.alert_rules (id) on delete cascade,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  payload jsonb,
  unique (rule_id, dedupe_key)
);

alter table public.push_subscriptions enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_deliveries enable row level security;

-- Each user (including anonymous auth users) sees and writes only their rows.
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rules" on public.alert_rules
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- alert_deliveries intentionally has RLS enabled with no policy: only the
-- service-role cron Edge Function may read/write it. The "RLS enabled, no
-- policy" advisor INFO notice is expected and by design.

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index alert_rules_user_id_idx on public.alert_rules (user_id);
create index alert_rules_enabled_location_idx
  on public.alert_rules (location_lat, location_lon)
  where enabled;
