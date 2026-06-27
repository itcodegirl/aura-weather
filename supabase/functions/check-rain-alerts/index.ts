// check-rain-alerts — cron-driven rain/severe/morning-brief push sender.
//
// Reads enabled alert_rules (service role, bypassing RLS), evaluates each
// against live Open-Meteo / NOAA data, and sends a Web Push to the owner's
// subscriptions. Honesty + no-spam guards: never fires on missing data,
// respects quiet hours, and dedupes via alert_deliveries' unique constraint.
//
// Secrets (set in the Supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//   CRON_SECRET (shared secret the cron job sends in x-cron-secret)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:alerts@aura-weather.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const RAIN_LIKELY_DEFAULT = 50; // matches the app's app-wide "likely" cutoff
const RAIN_LEAD_DEFAULT_MIN = 20;

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
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&minutely_15=precipitation_probability,precipitation&forecast_minutely_15=8` +
    `&daily=precipitation_sum,precipitation_probability_max&forecast_days=1` +
    `&timezone=auto`;
  const res = await fetch(url);
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

function localHour(forecast: Record<string, any>): number | null {
  const offset = Number(forecast?.utc_offset_seconds);
  if (!Number.isFinite(offset)) return null;
  return new Date(Date.now() + offset * 1000).getUTCHours();
}

function localDateKey(forecast: Record<string, any>): string {
  const offset = Number(forecast?.utc_offset_seconds) || 0;
  return new Date(Date.now() + offset * 1000).toISOString().slice(0, 10);
}

function inQuietHours(hour: number | null, start: unknown, end: unknown): boolean {
  if (hour === null || start == null || end == null) return false;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return s <= e ? hour >= s && hour < e : hour >= s || hour < e; // handles overnight wrap
}

type Decision = { dedupeKey: string; title: string; body: string } | null;

function evaluateRainIncoming(rule: any, forecast: any): Decision {
  const probs: unknown[] = forecast?.minutely_15?.precipitation_probability ?? [];
  const times: unknown[] = forecast?.minutely_15?.time ?? [];
  const lead = Number(rule.lead_time_min) || RAIN_LEAD_DEFAULT_MIN;
  const threshold = Number(rule.min_probability) || RAIN_LIKELY_DEFAULT;
  const steps = Math.max(1, Math.ceil(lead / 15));
  let peak = -1;
  let peakIdx = -1;
  for (let i = 0; i < Math.min(steps, probs.length); i += 1) {
    const p = Number(probs[i]);
    if (Number.isFinite(p) && p > peak) {
      peak = p;
      peakIdx = i;
    }
  }
  if (peak < 0) return null; // no usable data — stay silent (trust contract)
  if (peak < threshold) return null;
  const onset = String(times[peakIdx] ?? `${rule.id}-slot${peakIdx}`);
  return {
    dedupeKey: `rain:${onset}`,
    title: `Rain starting near ${rule.location_name}`,
    body: `${Math.round(peak)}% chance within ${lead} min. Tap for radar.`,
  };
}

function evaluateSevere(rule: any, features: any[]): Decision {
  if (!features.length) return null;
  const f = features[0];
  const event = f?.properties?.event ?? "Severe weather alert";
  const id = String(f?.id ?? event);
  return {
    dedupeKey: `severe:${id}`,
    title: `${event} — ${rule.location_name}`,
    body: String(f?.properties?.headline ?? "Active NWS alert. Tap for details."),
  };
}

function evaluateMorningBrief(rule: any, forecast: any): Decision {
  const hour = localHour(forecast);
  const briefHour = Number(rule.brief_hour);
  if (hour === null || !Number.isFinite(briefHour) || hour !== briefHour) return null;
  const sum = Number(forecast?.daily?.precipitation_sum?.[0]);
  const pmax = Number(forecast?.daily?.precipitation_probability_max?.[0]);
  const body = Number.isFinite(sum) && sum > 0.01
    ? `${sum.toFixed(2)} in expected today${Number.isFinite(pmax) ? ` (${Math.round(pmax)}% peak chance)` : ""}.`
    : "No meaningful rain expected today.";
  return {
    dedupeKey: `brief:${localDateKey(forecast)}`,
    title: `Good morning — ${rule.location_name}`,
    body,
  };
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
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
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
