import { getIsoDateInTimeZone } from "../utils/dates.js";
import { toFiniteNumber } from "../utils/numbers.js";

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
 * Falls back to 0 when no entry is upcoming, which matches ForecastCard's own
 * fallback (it renders every valid day when none are upcoming). A fully stale
 * snapshot then keeps both panels on the same day instead of making them
 * disagree in the other direction.
 *
 * Falls back to 0 for an unusable clock too: `nowMs` is passed explicitly
 * because this runs inside a useMemo factory, where reading a mutable global
 * would violate the repo's react-hooks/purity rule.
 */
export function resolveTodayIndex(weather, nowMs) {
  const times = Array.isArray(weather?.daily?.time) ? weather.daily.time : [];
  if (times.length === 0) {
    return 0;
  }

  const referenceTime = toFiniteNumber(nowMs);
  if (referenceTime === null) {
    return 0;
  }

  const todayIso = getIsoDateInTimeZone(
    weather?.meta?.timezone,
    new Date(referenceTime)
  );

  // Validated ISO dates compare correctly as strings — the same comparison
  // ForecastCard uses to pick its upcoming days.
  const index = times.findIndex(
    (date) => typeof date === "string" && date.trim() >= todayIso
  );

  return index === -1 ? 0 : index;
}
