// Pure decision logic for check-rain-alerts.
//
// Nothing in this module reads the environment, touches the network, or
// talks to Supabase or web-push. index.ts wires these functions into the
// cron handler; supabase/tests/check-rain-alerts/evaluators.spec.ts runs
// them under `deno test`. The handler itself cannot be imported there: it
// starts `Deno.serve` and reads secrets at module load. Wall-clock time is
// a parameter (`now`, ms since the epoch) so the hour-of-day rules are
// testable.

export const RAIN_LIKELY_DEFAULT = 50; // matches the app's app-wide "likely" cutoff
export const RAIN_LEAD_DEFAULT_MIN = 20;

// Open-Meteo reports precipitation in millimetres unless the request says
// otherwise, and the morning brief speaks inches. The request asks for
// inches, and the brief still reads the unit the payload declares before it
// formats an amount — a dropped query parameter must not print millimetres
// with an "in" suffix again.
export const FORECAST_PRECIPITATION_UNIT = "inch";
const MM_PER_INCH = 25.4;
// Divisors, not multipliers: 25.4 mm / 25.4 is exactly 1 in, whereas
// 25.4 * (1 / 25.4) is 0.9999999999999999.
const UNITS_PER_INCH: Record<string, number> = {
  inch: 1,
  mm: MM_PER_INCH,
};

// Below this many inches the brief says "no meaningful rain".
const MEANINGFUL_RAIN_INCHES = 0.01;

export type Decision = { dedupeKey: string; title: string; body: string } | null;

// Rows from alert_rules and provider payloads arrive untyped; the readers
// below coerce field by field instead of trusting a shape.
export type AlertRule = Record<string, unknown>;

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Strict numeric coercion — the same contract as src/utils/numbers.js in the
 * client. Plain Number() turns null, "" and false into 0, which would read
 * as a real "0.00 in" or "0% chance". Only a real number, a numeric string
 * or a numeric primitive counts; everything else is missing.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "object") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Open-Meteo: next ~2h of 15-minute precipitation probability + today's
// totals, with precipitation in the unit the brief prints.
export function buildForecastUrl(lat: number, lon: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&minutely_15=precipitation_probability,precipitation&forecast_minutely_15=8` +
    `&daily=precipitation_sum,precipitation_probability_max&forecast_days=1` +
    `&timezone=auto&precipitation_unit=${FORECAST_PRECIPITATION_UNIT}`
  );
}

/**
 * Converts a precipitation amount to inches using the unit the payload
 * declares for it. "inch" passes through, "mm" is converted, an undeclared
 * unit is Open-Meteo's documented default (mm), and any other unit is
 * refused as missing — a number whose unit is unknown is not a reading.
 */
export function precipitationInches(value: unknown, unit: unknown): number | null {
  const amount = toFiniteNumber(value);
  if (amount === null) return null;
  if (unit === undefined || unit === null) return amount / MM_PER_INCH;
  const divisor =
    typeof unit === "string" ? UNITS_PER_INCH[unit.trim().toLowerCase()] : undefined;
  return divisor === undefined ? null : amount / divisor;
}

export function localHour(forecast: unknown, now: number = Date.now()): number | null {
  const offset = Number(asObject(forecast).utc_offset_seconds);
  if (!Number.isFinite(offset)) return null;
  return new Date(now + offset * 1000).getUTCHours();
}

export function localDateKey(forecast: unknown, now: number = Date.now()): string {
  const offset = Number(asObject(forecast).utc_offset_seconds) || 0;
  return new Date(now + offset * 1000).toISOString().slice(0, 10);
}

export function inQuietHours(hour: number | null, start: unknown, end: unknown): boolean {
  if (hour === null || start == null || end == null) return false;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return s <= e ? hour >= s && hour < e : hour >= s || hour < e; // handles overnight wrap
}

export function evaluateRainIncoming(rule: AlertRule, forecast: unknown): Decision {
  const minutely = asObject(asObject(forecast).minutely_15);
  const probs = asArray(minutely.precipitation_probability);
  const times = asArray(minutely.time);
  // Finite check, not `|| default`: a legitimate 0 is a real setting —
  // min_probability 0 means "any rain chance", lead_time_min 0 means "right
  // now" — and must not be coerced to the default.
  const leadRaw = Number(rule.lead_time_min);
  const lead = Number.isFinite(leadRaw) ? leadRaw : RAIN_LEAD_DEFAULT_MIN;
  const thresholdRaw = Number(rule.min_probability);
  const threshold = Number.isFinite(thresholdRaw)
    ? thresholdRaw
    : RAIN_LIKELY_DEFAULT;
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
  // The scan covers whole quarter-hour slots, so a 20-minute lead reads 30
  // minutes of forecast. Quoting the rule's setting rather than the window
  // actually examined understated how far ahead the number looks. And the
  // figure is the peak of a chance series, not an observation, so the copy
  // says "rain likely" rather than announcing rain has started.
  const windowMin = steps * 15;
  return {
    dedupeKey: `rain:${onset}`,
    title: `Rain likely near ${rule.location_name}`,
    body: `${Math.round(peak)}% peak chance in the next ${windowMin} min. Tap for radar.`,
  };
}

// NWS severity and urgency ranks, mirrored from mapAlertSeverityScore and
// mapAlertUrgencyScore in src/api/openMeteo.js so the push headlines the
// same alert the dashboard's banner puts first. Kept as a copy on purpose:
// the deployed function cannot import from src/.
function severityScore(feature: unknown): number {
  const severity = asObject(asObject(feature).properties).severity;
  const normalized = typeof severity === "string" ? severity.trim().toLowerCase() : "";
  if (normalized === "extreme") return 4;
  if (normalized === "severe") return 3;
  if (normalized === "moderate") return 2;
  if (normalized === "minor") return 1;
  return 0;
}

function urgencyScore(feature: unknown): number {
  const urgency = asObject(asObject(feature).properties).urgency;
  const normalized = typeof urgency === "string" ? urgency.trim().toLowerCase() : "";
  if (normalized === "immediate") return 2;
  if (normalized === "expected") return 1;
  return 0;
}

/**
 * Orders active NWS alerts most severe first, then most urgent, and keeps
 * the feed's own order for ties. The feed itself is unordered, so the first
 * feature is an arbitrary alert — not the one worth a push.
 */
export function rankAlerts(features: unknown): unknown[] {
  return asArray(features)
    .map((feature, index) => ({
      feature,
      index,
      severity: severityScore(feature),
      urgency: urgencyScore(feature),
    }))
    .sort((a, b) => b.severity - a.severity || b.urgency - a.urgency || a.index - b.index)
    .map((entry) => entry.feature);
}

export function evaluateSevere(rule: AlertRule, features: unknown): Decision {
  const [top] = rankAlerts(features);
  if (top === undefined) return null;
  const feature = asObject(top);
  const properties = asObject(feature.properties);
  const event = properties.event ?? "Severe weather alert";
  const id = String(feature.id ?? event);
  return {
    dedupeKey: `severe:${id}`,
    title: `${event} — ${rule.location_name}`,
    body: String(properties.headline ?? "Active NWS alert. Tap for details."),
  };
}

export function evaluateMorningBrief(
  rule: AlertRule,
  forecast: unknown,
  now: number = Date.now(),
): Decision {
  const hour = localHour(forecast, now);
  const briefHour = Number(rule.brief_hour);
  if (hour === null || !Number.isFinite(briefHour) || hour !== briefHour) return null;
  const payload = asObject(forecast);
  const daily = asObject(payload.daily);
  const units = asObject(payload.daily_units);
  const inches = precipitationInches(
    asArray(daily.precipitation_sum)[0],
    units.precipitation_sum,
  );
  // No usable total means no brief: a push that guesses "no rain" from a
  // missing reading is the fabrication the trust contract forbids.
  if (inches === null) return null;
  const peakChance = toFiniteNumber(asArray(daily.precipitation_probability_max)[0]);
  const body = inches > MEANINGFUL_RAIN_INCHES
    ? `${inches.toFixed(2)} in expected today${
      peakChance === null ? "" : ` (${Math.round(peakChance)}% peak chance)`
    }.`
    : "No meaningful rain expected today.";
  return {
    dedupeKey: `brief:${localDateKey(forecast, now)}`,
    title: `Good morning — ${rule.location_name}`,
    body,
  };
}
