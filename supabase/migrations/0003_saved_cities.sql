-- Saved-city storage, moved off the public jsonblob.com endpoint.
--
-- The old store was an unauthenticated blob: anyone holding the URL could
-- read a user's home and work coordinates. This table replaces it, scoped
-- to the visitor's Supabase anonymous auth user, with RLS as the boundary.
--
-- Shape: one document row per user rather than one row per city. Saved
-- cities are always written as a whole ordered list (the client caps and
-- de-duplicates them before writing, and reordering is a first-class
-- feature), so a single jsonb array makes a save one atomic upsert. A
-- row-per-city table would need an explicit position column plus a
-- delete-then-insert dance that can tear if the second statement fails.

create table public.saved_cities (
  -- Defaulted from the JWT, never sent by the client, so a caller cannot
  -- write a row on someone else's behalf even before RLS is consulted.
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  cities jsonb not null default '[]'::jsonb
    constraint saved_cities_is_array check (jsonb_typeof(cities) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.saved_cities enable row level security;

-- `(select auth.uid())` rather than a bare `auth.uid()`: wrapping it in a
-- subquery lets Postgres hoist it into an InitPlan and evaluate it once per
-- statement instead of once per row. (0001_rain_alerts_schema.sql predates
-- this and still uses the bare call; not changed here to keep this migration
-- to one concern.)
--
-- Granted to `authenticated` only. The `anon` role — the pre-sign-in role
-- the publishable key maps to — gets no policy at all, so there is no
-- public read and no public write. That is the whole point of this file.
--
-- The `auth_allow_anonymous_sign_ins` advisor WARN on this table is expected
-- and by design: our users ARE anonymous auth users, so they arrive in the
-- `authenticated` role. The advisor is pointing out that this policy admits
-- them, which is the intent. alert_rules and push_subscriptions carry the
-- same notice for the same reason. The isolation is between anonymous users,
-- not against them.
create policy "own saved cities" on public.saved_cities
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
