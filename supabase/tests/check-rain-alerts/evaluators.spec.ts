// Deno tests for the pure decision logic behind the check-rain-alerts edge
// function. Run with `npm run test:edge` (needs Deno 2; CI installs it).
//
// Named `.spec.ts` on purpose. Node 22's bare `node --test` — the `npm test`
// suite — sweeps every `*.test.ts` and `*_test.ts` in the repo and would try
// to run these without a Deno global; `.spec.ts` is outside its patterns,
// so the file is handed to `deno test` by path instead. `node:assert` keeps
// the suite free of registry fetches, lockfiles and a deno.json the deployed
// function does not otherwise need.

import assert from "node:assert/strict";
import {
  buildForecastUrl,
  evaluateMorningBrief,
  evaluateRainIncoming,
  evaluateSevere,
  FORECAST_PRECIPITATION_UNIT,
  inQuietHours,
  localDateKey,
  localHour,
  precipitationInches,
  rankAlerts,
  toFiniteNumber,
} from "../../functions/check-rain-alerts/evaluators.ts";

// 2026-09-16 12:00Z is 07:00 in America/Chicago (UTC-5 in September).
const NOON_UTC = Date.UTC(2026, 8, 16, 12, 0, 0);
const CHICAGO_OFFSET = -18000;
const RULE = { id: "rule-1", location_name: "Palos Hills", brief_hour: 7 };

// Shape of the live response to the function's own query — the field names,
// unit declarations and offset are what Open-Meteo returns for
// `precipitation_unit=inch` on the default city.
function forecast(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    utc_offset_seconds: CHICAGO_OFFSET,
    timezone: "America/Chicago",
    daily_units: { time: "iso8601", precipitation_sum: "inch", precipitation_probability_max: "%" },
    daily: { time: ["2026-09-16"], precipitation_sum: [0.31], precipitation_probability_max: [60] },
    minutely_15_units: { time: "iso8601", precipitation_probability: "%", precipitation: "inch" },
    minutely_15: {
      time: ["2026-09-16T07:00", "2026-09-16T07:15", "2026-09-16T07:30"],
      precipitation_probability: [10, 60, 80],
      precipitation: [0, 0.01, 0.02],
    },
    ...overrides,
  };
}

function alert(
  id: string,
  severity: string | null,
  urgency: string | null,
  event = "Alert",
): Record<string, unknown> {
  return { id, properties: { event, severity, urgency, headline: `${event} headline` } };
}

Deno.test("the forecast request asks Open-Meteo for inches", () => {
  const url = new URL(buildForecastUrl(41.8781, -87.6298));
  assert.equal(url.origin + url.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(url.searchParams.get("precipitation_unit"), "inch");
  assert.equal(FORECAST_PRECIPITATION_UNIT, "inch");
  assert.equal(url.searchParams.get("latitude"), "41.8781");
  assert.equal(url.searchParams.get("longitude"), "-87.6298");
  assert.equal(url.searchParams.get("daily"), "precipitation_sum,precipitation_probability_max");
  assert.equal(url.searchParams.get("minutely_15"), "precipitation_probability,precipitation");
  assert.equal(url.searchParams.get("forecast_minutely_15"), "8");
  assert.equal(url.searchParams.get("forecast_days"), "1");
  assert.equal(url.searchParams.get("timezone"), "auto");
});

Deno.test("morning brief formats an inch-declared total as inches", () => {
  const decision = evaluateMorningBrief(RULE, forecast(), NOON_UTC);
  assert.deepEqual(decision, {
    dedupeKey: "brief:2026-09-16",
    title: "Good morning — Palos Hills",
    body: "0.31 in expected today (60% peak chance).",
  });
});

Deno.test("morning brief converts a millimetre-declared total instead of printing it as inches", () => {
  // Open-Meteo's default with no precipitation_unit: 4.2 mm, which the
  // function used to print as "4.20 in expected today".
  const decision = evaluateMorningBrief(
    RULE,
    forecast({
      daily_units: { time: "iso8601", precipitation_sum: "mm", precipitation_probability_max: "%" },
      daily: { time: ["2026-09-16"], precipitation_sum: [4.2], precipitation_probability_max: [47] },
    }),
    NOON_UTC,
  );
  assert.ok(decision);
  assert.equal(decision.body, "0.17 in expected today (47% peak chance).");
  assert.ok(!decision.body.includes("4.20"));
});

Deno.test("morning brief applies the dry cutoff in inches, not millimetres", () => {
  // 0.2 mm is 0.008 in — below the 0.01 in "meaningful" line. The old code
  // compared 0.2 against 0.01 and announced "0.20 in expected today".
  const decision = evaluateMorningBrief(
    RULE,
    forecast({
      daily_units: { time: "iso8601", precipitation_sum: "mm", precipitation_probability_max: "%" },
      daily: { time: ["2026-09-16"], precipitation_sum: [0.2], precipitation_probability_max: [20] },
    }),
    NOON_UTC,
  );
  assert.ok(decision);
  assert.equal(decision.body, "No meaningful rain expected today.");
});

Deno.test("morning brief stays silent when the total is missing or its unit is unknown", () => {
  const missing = forecast({
    daily: { time: ["2026-09-16"], precipitation_sum: [null], precipitation_probability_max: [60] },
  });
  assert.equal(evaluateMorningBrief(RULE, missing, NOON_UTC), null);

  const unknownUnit = forecast({
    daily_units: { time: "iso8601", precipitation_sum: "cm", precipitation_probability_max: "%" },
  });
  assert.equal(evaluateMorningBrief(RULE, unknownUnit, NOON_UTC), null);

  const noDaily = forecast({ daily: undefined, daily_units: undefined });
  assert.equal(evaluateMorningBrief(RULE, noDaily, NOON_UTC), null);
});

Deno.test("morning brief omits the peak chance when it is missing rather than printing 0%", () => {
  const decision = evaluateMorningBrief(
    RULE,
    forecast({
      daily: { time: ["2026-09-16"], precipitation_sum: [0.31], precipitation_probability_max: [null] },
    }),
    NOON_UTC,
  );
  assert.ok(decision);
  assert.equal(decision.body, "0.31 in expected today.");
});

Deno.test("morning brief fires only at the rule's local hour", () => {
  // 13:00Z is 08:00 in Chicago; the rule wants 07:00.
  assert.equal(evaluateMorningBrief(RULE, forecast(), NOON_UTC + 60 * 60 * 1000), null);
  // Without an offset the local hour is unknown, so no brief.
  assert.equal(
    evaluateMorningBrief(RULE, forecast({ utc_offset_seconds: undefined }), NOON_UTC),
    null,
  );
  // A rule with no brief hour never briefs.
  assert.equal(evaluateMorningBrief({ ...RULE, brief_hour: null }, forecast(), NOON_UTC), null);
});

Deno.test("precipitationInches trusts the declared unit and refuses what it cannot read", () => {
  assert.equal(precipitationInches(0.31, "inch"), 0.31);
  assert.equal(precipitationInches("0.31", "inch"), 0.31);
  assert.equal(precipitationInches(25.4, "mm"), 1);
  assert.equal(precipitationInches(1, " INCH "), 1);
  // Undeclared falls back to Open-Meteo's documented default, millimetres.
  assert.equal(precipitationInches(25.4, undefined), 1);
  assert.equal(precipitationInches(25.4, null), 1);
  assert.equal(precipitationInches(1, "cm"), null);
  assert.equal(precipitationInches(1, 7), null);
  assert.equal(precipitationInches(null, "inch"), null);
  assert.equal(precipitationInches("", "inch"), null);
  assert.equal(precipitationInches(true, "inch"), null);
  assert.equal(precipitationInches([0.31], "inch"), null);
  assert.equal(precipitationInches("wet", "inch"), null);
});

Deno.test("toFiniteNumber matches the client's strict coercion", () => {
  assert.equal(toFiniteNumber(0), 0);
  assert.equal(toFiniteNumber("12.5"), 12.5);
  assert.equal(toFiniteNumber(null), null);
  assert.equal(toFiniteNumber(undefined), null);
  assert.equal(toFiniteNumber(""), null);
  assert.equal(toFiniteNumber("  "), null);
  assert.equal(toFiniteNumber(false), null);
  assert.equal(toFiniteNumber([]), null);
  assert.equal(toFiniteNumber({}), null);
  assert.equal(toFiniteNumber(Number.NaN), null);
  assert.equal(toFiniteNumber(Number.POSITIVE_INFINITY), null);
});

Deno.test("severe push headlines the most severe alert, not the first in the feed", () => {
  const features = [
    alert("minor-1", "Minor", "Expected", "Dense Fog Advisory"),
    alert("extreme-1", "Extreme", "Immediate", "Tornado Warning"),
    alert("severe-1", "Severe", "Immediate", "Severe Thunderstorm Warning"),
  ];
  const decision = evaluateSevere({ location_name: "Palos Hills" }, features);
  assert.deepEqual(decision, {
    dedupeKey: "severe:extreme-1",
    title: "Tornado Warning — Palos Hills",
    body: "Tornado Warning headline",
  });
});

Deno.test("rankAlerts orders by severity, then urgency, then feed order", () => {
  const ranked = rankAlerts([
    alert("a", "Severe", "Expected"),
    alert("b", "Severe", "Immediate"),
    alert("c", null, null),
    alert("d", "moderate", "immediate"),
    alert("e", "Severe", "Immediate"),
  ]).map((feature) => (feature as { id: string }).id);
  assert.deepEqual(ranked, ["b", "e", "a", "d", "c"]);
});

Deno.test("severe push copes with sparse features and an empty feed", () => {
  assert.equal(evaluateSevere({ location_name: "Palos Hills" }, []), null);
  assert.equal(evaluateSevere({ location_name: "Palos Hills" }, undefined), null);
  assert.equal(evaluateSevere({ location_name: "Palos Hills" }, "not a list"), null);

  const decision = evaluateSevere({ location_name: "Palos Hills" }, [{}]);
  assert.deepEqual(decision, {
    dedupeKey: "severe:Severe weather alert",
    title: "Severe weather alert — Palos Hills",
    body: "Active NWS alert. Tap for details.",
  });
});

Deno.test("rain-incoming fires on the peak within the lead window", () => {
  const rule = { id: "rule-2", location_name: "Palos Hills", lead_time_min: 20, min_probability: 50 };
  // 20 min covers two 15-minute steps: 10% then 60%; the 80% third step is out of range.
  const decision = evaluateRainIncoming(rule, forecast());
  assert.deepEqual(decision, {
    dedupeKey: "rain:2026-09-16T07:15",
    title: "Rain starting near Palos Hills",
    body: "60% chance within 20 min. Tap for radar.",
  });
});

Deno.test("rain-incoming stays silent below the threshold or without data", () => {
  const rule = { id: "rule-2", location_name: "Palos Hills", lead_time_min: 20, min_probability: 70 };
  assert.equal(evaluateRainIncoming(rule, forecast()), null);
  assert.equal(
    evaluateRainIncoming(rule, forecast({ minutely_15: { time: [], precipitation_probability: [] } })),
    null,
  );
  assert.equal(evaluateRainIncoming(rule, forecast({ minutely_15: undefined })), null);
});

Deno.test("rain-incoming keeps a real 0 setting instead of swapping in the default", () => {
  // min_probability 0 means "any rain chance": a 10% peak must fire.
  const rule = { id: "rule-3", location_name: "Palos Hills", lead_time_min: 15, min_probability: 0 };
  const decision = evaluateRainIncoming(rule, forecast());
  assert.ok(decision);
  assert.equal(decision.body, "10% chance within 15 min. Tap for radar.");
  // Missing settings fall back to the defaults: 20 min, 50%.
  const defaults = evaluateRainIncoming({ id: "rule-4", location_name: "Palos Hills" }, forecast());
  assert.ok(defaults);
  assert.equal(defaults.body, "60% chance within 20 min. Tap for radar.");
});

Deno.test("local hour and date key follow the payload's UTC offset", () => {
  assert.equal(localHour(forecast(), NOON_UTC), 7);
  assert.equal(localDateKey(forecast(), NOON_UTC), "2026-09-16");
  // 03:00Z on the 17th is still the evening of the 16th in Chicago.
  const lateEvening = Date.UTC(2026, 8, 17, 3, 0, 0);
  assert.equal(localHour(forecast(), lateEvening), 22);
  assert.equal(localDateKey(forecast(), lateEvening), "2026-09-16");
  assert.equal(localHour(forecast({ utc_offset_seconds: undefined }), NOON_UTC), null);
  assert.equal(localHour(undefined, NOON_UTC), null);
});

Deno.test("quiet hours wrap past midnight", () => {
  assert.equal(inQuietHours(23, 22, 6), true);
  assert.equal(inQuietHours(3, 22, 6), true);
  assert.equal(inQuietHours(6, 22, 6), false);
  assert.equal(inQuietHours(12, 22, 6), false);
  assert.equal(inQuietHours(12, 9, 17), true);
  assert.equal(inQuietHours(17, 9, 17), false);
  assert.equal(inQuietHours(null, 22, 6), false);
  assert.equal(inQuietHours(23, null, 6), false);
  assert.equal(inQuietHours(23, "22", "6"), true);
});
