// Client side of the rain-alerts feature: anonymous auth, Web Push
// subscription, and CRUD for the per-location alert rules the cron Edge
// Function evaluates. Everything is feature-detected and degrades gracefully
// when alerts are unconfigured or unsupported (e.g. a non-installed browser).

import { getSupabaseClient, isAlertsConfigured } from "./supabaseClient.js";

const VAPID_PUBLIC_KEY = (import.meta.env ?? {}).VITE_VAPID_PUBLIC_KEY ?? "";

export const ALERT_TYPES = ["rain_incoming", "severe", "morning_brief"];

const RULE_DEFAULTS = {
  rain_incoming: { min_probability: 50, lead_time_min: 20 },
  severe: {},
  morning_brief: { brief_hour: 7 },
};

export function isPushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isAlertsAvailable() {
  return isAlertsConfigured() && isPushSupported() && Boolean(VAPID_PUBLIC_KEY);
}

export function getPermission() {
  return isPushSupported() ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function getRegistration() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker.ready;
}

// Anonymous Supabase session — created once per device, reused thereafter.
// Upgradeable to Sign in with Apple later without losing the rows.
export async function ensureSession() {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

export async function getExistingSubscription() {
  const registration = await getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Requests permission, subscribes to push, and saves the subscription so the
// Edge Function can reach this device. Returns the auth user.
export async function enablePush() {
  if (!isAlertsAvailable()) {
    throw new Error("Alerts aren't available on this device.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications weren't allowed.");
  }
  const user = await ensureSession();
  if (!user) throw new Error("Couldn't start an alerts session.");

  const registration = await getRegistration();
  if (!registration) throw new Error("The app isn't installed for background alerts yet.");

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
  return user;
}

// Disables server-side delivery for this device's subscription. The browser
// subscription is left intact so re-enabling is instant.
export async function disablePush() {
  const subscription = await getExistingSubscription();
  const supabase = await getSupabaseClient();
  if (subscription && supabase) {
    await supabase
      .from("push_subscriptions")
      .update({ enabled: false })
      .eq("endpoint", subscription.endpoint);
  }
}

export async function listRules() {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];
  const user = await ensureSession();
  if (!user) return [];
  const { data } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("user_id", user.id);
  return data ?? [];
}

export async function addRule({ type, location }) {
  const supabase = await getSupabaseClient();
  const user = await ensureSession();
  if (!supabase || !user) throw new Error("Alerts session unavailable.");
  const { data, error } = await supabase
    .from("alert_rules")
    .insert({
      user_id: user.id,
      type,
      location_lat: location.lat,
      location_lon: location.lon,
      location_name: location.name,
      timezone: location.timezone ?? null,
      enabled: true,
      ...RULE_DEFAULTS[type],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeRule(ruleId) {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  await supabase.from("alert_rules").delete().eq("id", ruleId);
}

// Local notification straight from the service worker — proves permission +
// rendering work end-to-end without waiting on the cron cycle.
export async function sendTestNotification() {
  const registration = await getRegistration();
  if (!registration) throw new Error("The app isn't installed for notifications yet.");
  await registration.showNotification("Aura test alert", {
    body: "Push notifications are working — rain alerts will look like this.",
    tag: "aura-test",
    icon: "/apple-touch-icon.png",
    badge: "/favicon.svg",
  });
}
