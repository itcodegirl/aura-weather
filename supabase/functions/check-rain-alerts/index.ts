// check-rain-alerts — cron-driven rain/severe/morning-brief push sender.
//
// Reads enabled alert_rules (service role, bypassing RLS), evaluates each
// against live Open-Meteo / NOAA data, and sends a Web Push to the owner's
// subscriptions. Honesty + no-spam guards: never fires on missing data,
// respects quiet hours, and dedupes via alert_deliveries' unique constraint.
//
// The decisions themselves live in ./evaluators.ts, which is pure and has
// Deno tests (supabase/tests/check-rain-alerts/); this file is the I/O.
//
// Secrets (set in the Supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//   CRON_SECRET (shared secret the cron job sends in x-cron-secret)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  buildForecastUrl,
  type Decision,
  evaluateMorningBrief,
  evaluateRainIncoming,
  evaluateSevere,
  inQuietHours,
  localHour,
} from "./evaluators.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:alerts@aura-weather.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function appDeepLink(rule: Record<string, unknown>): string {
  const lat = rule.location_lat;
  const lon = rule.location_lon;
  const name = encodeURIComponent(String(rule.location_name ?? ""));
  return `/?lat=${lat}&lon=${lon}&name=${name}`;
}

// Open-Meteo: next ~2h of 15-minute precipitation probability + today's totals.
async function fetchForecast(lat: number, lon: number) {
  const res = await fetch(buildForecastUrl(lat, lon));
  if (!res.ok) return null;
  return await res.json();
}

// NOAA/NWS active alerts for a point (US only — empty elsewhere, never an error).
async function fetchSevere(lat: number, lon: number) {
  const res = await fetch(
    `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
    { headers: { "User-Agent": "AuraWeather/1.0 (rain alerts)", Accept: "application/geo+json" } },
  );
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.features) ? json.features : [];
}

async function sendPush(sub: any, payload: Record<string, unknown>): Promise<"ok" | "expired" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    return status === 404 || status === 410 ? "expired" : "error";
  }
}

Deno.serve(async (req) => {
  // Fail closed: an unset CRON_SECRET is a misconfiguration, not license to
  // accept every caller. Require the secret to be configured (500 if not) and
  // to match the caller's header (403 if not) before doing any work.
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: "CRON_SECRET is not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: rules } = await admin.from("alert_rules").select("*").eq("enabled", true);
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("enabled", true);
  const subsByUser = new Map<string, any[]>();
  for (const s of subs ?? []) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  // Batch forecast/severe fetches per unique location.
  const forecastCache = new Map<string, any>();
  const severeCache = new Map<string, any[]>();
  let sent = 0;

  for (const rule of rules ?? []) {
    const lat = Number(rule.location_lat);
    const lon = Number(rule.location_lon);
    const locKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;

    let decision: Decision = null;
    if (rule.type === "severe") {
      if (!severeCache.has(locKey)) severeCache.set(locKey, await fetchSevere(lat, lon));
      decision = evaluateSevere(rule, severeCache.get(locKey)!);
    } else {
      if (!forecastCache.has(locKey)) forecastCache.set(locKey, await fetchForecast(lat, lon));
      const forecast = forecastCache.get(locKey);
      if (!forecast) continue;
      if (inQuietHours(localHour(forecast), rule.quiet_start, rule.quiet_end)) continue;
      decision = rule.type === "morning_brief"
        ? evaluateMorningBrief(rule, forecast)
        : evaluateRainIncoming(rule, forecast);
    }
    if (!decision) continue;

    // Dedupe: a unique-violation on (rule_id, dedupe_key) means "already sent".
    const payload = { title: decision.title, body: decision.body, url: appDeepLink(rule), tag: rule.type };
    const { error: dupeError } = await admin
      .from("alert_deliveries")
      .insert({ rule_id: rule.id, dedupe_key: `${rule.id}:${decision.dedupeKey}`, payload });
    if (dupeError) continue;

    for (const sub of subsByUser.get(rule.user_id) ?? []) {
      const result = await sendPush(sub, payload);
      if (result === "ok") sent += 1;
      else if (result === "expired") {
        await admin.from("push_subscriptions").update({ enabled: false }).eq("id", sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, rules: rules?.length ?? 0, sent }), {
    headers: { "content-type": "application/json" },
  });
});
