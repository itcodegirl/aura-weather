import { toFiniteNumber } from "../../utils/numbers.js";
import { getSunlightPhase } from "../../utils/sunlight.js";
import { getZonedNow } from "../../utils/dates.js";

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

const RAIN_IMMINENT_HOURS = 2;
const RAIN_IMMINENT_PROBABILITY = 50;
const HIGH_UV = 8;
const MODERATE_UV = 6;
const GUSTY_MPH = 28;
const HOT_F = 90;
const COLD_F = 28;
const CHILLY_F = 45;

function findFirstRainHourIndex(hourly) {
  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.rainChance)
  ) {
    return -1;
  }

  const limit = Math.min(hourly.time.length, RAIN_IMMINENT_HOURS + 1);
  for (let i = 1; i < limit; i += 1) {
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

  // 1. Severe weather alert — highest priority, supersedes everything.
  const alerts = Array.isArray(weather.alerts) ? weather.alerts : [];
  const seriousAlert = alerts.find(
    (alert) =>
      alert?.priority === "high" || alert?.priority === "extreme"
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
  const rainHourIndex = findFirstRainHourIndex(weather.hourly);
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
  const sunrise = weather.daily?.sunrise?.[0];
  const sunset = weather.daily?.sunset?.[0];
  const zonedNowMs = Number.isFinite(nowMs)
    ? getZonedNow(weather?.meta?.timezone, nowMs).getTime()
    : nowMs;
  const nowDate = Number.isFinite(zonedNowMs) ? new Date(zonedNowMs) : null;
  const sunriseDate = sunrise ? new Date(sunrise) : null;
  const sunsetDate = sunset ? new Date(sunset) : null;
  const isDaylight =
    nowDate &&
    sunriseDate &&
    sunsetDate &&
    Number.isFinite(sunriseDate.getTime()) &&
    Number.isFinite(sunsetDate.getTime()) &&
    nowDate.getTime() >= sunriseDate.getTime() &&
    nowDate.getTime() <= sunsetDate.getTime();

  if (isDaylight) {
    const uvIndex = toFiniteNumber(weather.daily?.uvIndexMax?.[0]);
    if (uvIndex !== null && uvIndex >= HIGH_UV) {
      return {
        tone: "watch",
        text: `Very high UV (${uvIndex.toFixed(1)}) — sunscreen if you're heading out.`,
      };
    }
    if (uvIndex !== null && uvIndex >= MODERATE_UV) {
      return {
        tone: "notice",
        text: `Moderate UV today — easy on the sun exposure.`,
      };
    }
  }

  // 4. Gusty winds.
  const gust = toFiniteNumber(weather.current.windGust);
  if (gust !== null && gust >= GUSTY_MPH) {
    return {
      tone: "notice",
      text: `Gusts to ${Math.round(gust)} mph — secure loose items outside.`,
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
  void unit;
  return null;
}
