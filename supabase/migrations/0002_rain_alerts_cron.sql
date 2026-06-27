-- Schedules check-rain-alerts to run every 15 minutes (pg_cron + pg_net).
--
-- The live job sends the shared CRON_SECRET in the x-cron-secret header so the
-- Edge Function (deployed verify_jwt=false) can authenticate the caller. The
-- literal secret is intentionally NOT committed here: replace __CRON_SECRET__
-- with the value also stored as the Edge Function's CRON_SECRET secret when
-- re-applying to a fresh project. For a hardened setup, store it in Supabase
-- Vault and read it via a subquery instead of inlining.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'check-rain-alerts-every-15min',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://uyednvctjudnrpheubyv.supabase.co/functions/v1/check-rain-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '__CRON_SECRET__'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
