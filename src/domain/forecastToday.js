import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toFiniteNumber } from "../utils/numbers.js";
import { toEpochMs } from "../utils/zonedTime.js";

/**
 * Which entry in `weather.daily.*` is today.
 *
 * The hero read index 0 unconditionally while ForecastCard filters its rows to
 * `date >= today` in the *location's* timezone. Those agree on a fresh fetch
 * and diverge on a restored one: a snapshot captured yesterday still carries
 * yesterday at index 0, so the hero showed yesterday's high, low, sun times
 * and UV peak while the Week Ahead's first row was today. Two panels on the
 * same screen, disagreeing about the same day.
 *
 * That is a trust-contract failure rather than a cosmetic one. The worst case
 * is UV: a stale index 0 of 1 renders "no special protection required" over a
 * day whose real peak is 9.
 *
 * Still falls back to index 0 when no entry is upcoming, and says so.
 *
 * ── Why the index stays 0, and why that is not enough ─────────────────────
 *
 * The 0 fallback matches ForecastCard's own (it renders every valid day when
 * none are upcoming), so a fully run-out snapshot keeps both panels on the
 * same day instead of making them disagree in the other direction. That is
 * worth keeping: the two-panels-disagree defect above is exactly what this
 * function exists to close.
 *
 * But 0 is a real, in-range index, and callers could not tell it from a hit.
 * Measured on a daily series dated 2026-04-21 read on 2026-09-17, the hero
 * printed a date read from the CLOCK over numbers read from the SERIES:
 *
 *   today            : Thursday, September 17
 *   todayHighDisplay : 88°F
 *
 * Not stale data shown as stale — a specific false claim about a specific
 * named day. So the index still points somewhere sane, and `status` carries
 * whether it is actually today. Present-tense callers answer for it; callers
 * that only render a dated row do not. See
 * `docs/decisions/resolveTodayIndex-runout.md`.
 *
 * `unknown` is deliberately not `stale`. HeroCard passes `nowMs: null` until
 * useTimeNow resolves, which is a real first-paint state, and a missing daily
 * series already renders "—" from an undefined lookup. Neither is a run-out
 * series, and collapsing them would blank the hero on every first paint.
 *
 * The bound is the series' own cadence — `findIndex` returning -1 against the
 * location's calendar date — and nothing else. Snapshot age
 * (`DEGRADED_SNAPSHOT_MAX_AGE_MS`) answers a different question: how old the
 * fetch is, not whether the days inside it have run out. They are not unified
 * on purpose.
 *
 * @typedef {"ok" | "unknown" | "stale"} TodayStatus
 *
 * `ok`      — `index` is today, or the next upcoming day the series carries.
 * `unknown` — no usable daily dates, or no usable clock. `index` is 0 and
 *             callers behave exactly as they did before.
 * `stale`   — every daily entry is behind today. `index` is 0 so the panels
 *             still agree; `staleByMs` says how far behind the last one is.
 *
 * @typedef {{index: number, status: TodayStatus, staleByMs: number|null}} TodayIndex
 *
 * `nowMs` is passed explicitly because this runs inside a useMemo factory,
 * where reading a mutable global would violate the repo's react-hooks/purity
 * rule.
 *
 * @returns {TodayIndex}
 */
export function resolveTodayIndex(weather, nowMs) {
  const times = Array.isArray(weather?.daily?.time) ? weather.daily.time : [];
  const usable = times.filter(
    (date) => typeof date === "string" && date.trim() !== ""
  );
  if (usable.length === 0) {
    return { index: 0, status: "unknown", staleByMs: null };
  }

  const referenceTime = toFiniteNumber(nowMs);
  if (referenceTime === null) {
    return { index: 0, status: "unknown", staleByMs: null };
  }

  const timeZone = weather?.meta?.timezone;
  const todayIso = getIsoDateInTimeZone(timeZone, new Date(referenceTime));

  // Validated ISO dates compare correctly as strings — the same comparison
  // ForecastCard uses to pick its upcoming days.
  const index = times.findIndex(
    (date) => typeof date === "string" && date.trim() >= todayIso
  );

  if (index !== -1) {
    return { index, status: "ok", staleByMs: null };
  }

  // Every entry is behind today. Measured from the START of the last day the
  // series carries, resolved through the location's zone — those entries are
  // the location's calendar dates, not the viewer's.
  const lastDay = usable[usable.length - 1].trim().slice(0, 10);
  const lastDayMs = toEpochMs(`${lastDay}T00:00`, timeZone);

  return {
    index: 0,
    status: "stale",
    staleByMs: lastDayMs === null ? null : referenceTime - lastDayMs,
  };
}
