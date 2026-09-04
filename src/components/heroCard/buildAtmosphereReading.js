import { classifyUv } from "../../domain/exposure.js";
import { resolveTodayIndex } from "../../domain/forecastToday.js";
import { formatWindSpeed } from "../../domain/wind.js";
import { toFiniteNumber } from "../../utils/numbers.js";
import { getSunlightPhase, getZonedNowMs, isDaylight } from "../../utils/sunlight.js";
import { getZonedNow } from "../../utils/dates.js";
import { findWindowStartIndex } from "../../utils/timeSeries.js";

/*
 * Picks one short sentence to surface above the hero temperature.
 * Priority-ranked: severe alerts beat imminent rain beats UV beats
 * gusts beats temperature extreme beats golden hour beats baseline.
 * Returns null when no signal merits a callout — callers should
 * render nothing in that case rather than show empty filler copy.
 *
 * The synthesis is deliberately heuristic: a daily user wants the
 * single most decision-relevant fact, not a weather diary. Each
 * branch returns at most one sentence with at most one suffix
 * (sunset clock, time-to-rain, gust value).
 */

function toValidDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const RAIN_IMMINENT_HOURS = 2;
const RAIN_IMMINENT_PROBABILITY = 50;
const GUSTY_MPH = 28;
const HOT_F = 90;
const COLD_F = 28;
const CHILLY_F = 45;

/*
 * Scans the hours immediately AFTER now for imminent rain.
 *
 * The forecast request carries past_hours=48, so hourly index 0 is two days
 * in the past. Scanning from index 1 read hours 47 and 46 hours *ago* and
 * presented them as "the next two hours" — rain that fell the day before
 * yesterday surfaced as "Rain likely around 3:00 pm — bring an umbrella"
 * (formatHourClock prints time-of-day only, so the stale date never showed),
 * while genuinely imminent rain went undetected. This branch also outranks
 * the UV/gust/temperature readings, so a false positive silenced them too.
 */
function findFirstRainHourIndex(hourly, timeZone, nowMs) {
  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.rainChance)
  ) {
    return -1;
  }

  const nowIdx = findWindowStartIndex(hourly.time, {
    now: Number.isFinite(nowMs)
      ? getZonedNow(timeZone, nowMs).getTime()
      : getZonedNow(timeZone).getTime(),
    currentSlotToleranceMs: 60 * 60 * 1000,
  });
  if (nowIdx < 0) {
    return -1;
  }

  const limit = Math.min(hourly.time.length, nowIdx + RAIN_IMMINENT_HOURS + 1);
  for (let i = nowIdx + 1; i < limit; i += 1) {
    const probability = toFiniteNumber(hourly.rainChance[i]);
    if (probability !== null && probability >= RAIN_IMMINENT_PROBABILITY) {
      return i;
    }
  }
  return -1;
}

function formatHourClock(isoOrDate) {
  const value =
    isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(value.getTime())) {
    return "";
  }
  return value
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

export function buildAtmosphereReading({ weather, nowMs, unit = "F" } = {}) {
  if (!weather?.current) {
    return null;
  }

  // Same day the hero and the Week Ahead use; see resolveTodayIndex. Reading
  // index 0 put a restored snapshot's yesterday sun times and UV peak here.
  const todayIndex = resolveTodayIndex(weather, nowMs);

  // 1. Severe weather alert — highest priority, supersedes everything.
  const alerts = Array.isArray(weather.alerts) ? weather.alerts : [];
  const seriousAlert = alerts.find(
    (alert) =>
      alert?.priority === "critical" ||
      alert?.priority === "high" ||
      alert?.priority === "extreme"
  );
  if (seriousAlert) {
    const event =
      typeof seriousAlert.event === "string" && seriousAlert.event.trim()
        ? seriousAlert.event.trim()
        : "Severe weather alert";
    return {
      tone: "alert",
      text: `${event} in effect — stay alert.`,
    };
  }

  // 2. Imminent rain in the next two hours.
  const rainHourIndex = findFirstRainHourIndex(
    weather.hourly,
    weather?.meta?.timezone,
    nowMs
  );
  if (rainHourIndex > 0) {
    const rainTime = weather.hourly?.time?.[rainHourIndex];
    const clock = rainTime ? formatHourClock(rainTime) : "";
    const probability = Math.round(
      toFiniteNumber(weather.hourly?.rainChance?.[rainHourIndex]) ?? 0
    );
    return {
      tone: "notice",
      text: clock
        ? `Rain likely around ${clock} (${probability}%) — bring an umbrella.`
        : `Rain likely soon (${probability}%) — bring an umbrella.`,
    };
  }

  // 3. High UV warrants a sunscreen note. Only surface during daylight.
  // Reframe "now" into the location's wall clock so the daylight gate
  // and golden-hour phase below line up with Open-Meteo's naive
  // sunrise/sunset timestamps. The clock labels rendered below still use
  // the naive strings directly, which already display the location's
  // wall-clock time correctly. See getZonedNow in utils/dates.
  const sunrise = weather.daily?.sunrise?.[todayIndex];
  const sunset = weather.daily?.sunset?.[todayIndex];
  const zonedNowMs = getZonedNowMs(weather?.meta?.timezone, nowMs);
  // Parsed once for the golden-hour clock labels below (null when the
  // provider string is unusable, so formatHourClock never sees an Invalid
  // Date). The daylight decision itself goes through isDaylight.
  const sunriseDate = toValidDate(sunrise);
  const sunsetDate = toValidDate(sunset);

  // One daylight rule, shared with the hero's UV guidance pill (see
  // buildUvGuidance). The two used to carry separate copies of this
  // comparison, and only this one gated at all — so the pill kept saying
  // "Use sun protection" after dark while the reading correctly went quiet.
  if (isDaylight(sunrise, sunset, zonedNowMs)) {
    // Band words come from the shared WHO classifier so the reading
    // line can never disagree with the UV chip or panel. Only High and
    // above merits a hero callout; Moderate stays a panel-level fact.
    const uvIndex = toFiniteNumber(weather.daily?.uvIndexMax?.[todayIndex]);
    const uvBand = classifyUv(uvIndex)?.band;
    if (uvBand === "very-high" || uvBand === "extreme") {
      return {
        tone: "watch",
        text: `Very high UV (${uvIndex.toFixed(1)}) — sunscreen if you're heading out.`,
      };
    }
    if (uvBand === "high") {
      return {
        tone: "notice",
        text: `High UV (${uvIndex.toFixed(1)}) — sun protection is worth it if you're heading out.`,
      };
    }
  }

  // 4. Gusty winds.
  const gust = toFiniteNumber(weather.current.windGust);
  if (gust !== null && gust >= GUSTY_MPH) {
    return {
      tone: "notice",
      // GUSTY_MPH is a threshold on the raw reading, which is fetched in
      // mph app-wide — but the *rendered* figure has to follow the display
      // unit, as every other wind readout on the page does. This line
      // hardcoded "mph", so a metric user read a gust in mph directly
      // beside a wind speed in km/h.
      text: `Gusts to ${formatWindSpeed(gust, unit)} — secure loose items outside.`,
    };
  }

  // 5. Temperature extremes (uses raw F because trust contract data is F).
  const tempF = toFiniteNumber(weather.current.temperature);
  if (tempF !== null) {
    if (tempF >= HOT_F) {
      return {
        tone: "watch",
        text: `Hot day — stay hydrated and find shade where you can.`,
      };
    }
    if (tempF <= COLD_F) {
      return {
        tone: "watch",
        text: `Bitter cold — heavy coat and gloves.`,
      };
    }
    if (tempF <= CHILLY_F) {
      return {
        tone: "calm",
        text: `Chilly air — light jacket weather.`,
      };
    }
  }

  // 6. Golden hour — quiet seasonal beat.
  const phase = getSunlightPhase(sunrise, sunset, zonedNowMs, {
    toleranceMinutes: 30,
  });
  if (phase === "sunset" && sunsetDate) {
    const clock = formatHourClock(sunsetDate);
    return {
      tone: "calm",
      text: clock ? `Golden hour — sunset at ${clock}.` : `Golden hour — soak it in.`,
    };
  }
  if (phase === "sunrise" && sunriseDate) {
    const clock = formatHourClock(sunriseDate);
    return {
      tone: "calm",
      text: clock ? `Sunrise at ${clock} — easy start.` : `Quiet morning light.`,
    };
  }

  // 7. Baseline — only return a reading when something else above
  // matched. A blank baseline avoids cluttering the hero with
  // generic "Enjoy the day!" filler that earns the user's eye-roll.
  return null;
}
