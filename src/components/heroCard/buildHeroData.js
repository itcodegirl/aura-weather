import { getWeather, UNKNOWN_WEATHER } from "../../domain/weatherCodes.js";
import { classifyUv } from "../../domain/exposure.js";
import { classifyComfort } from "../../domain/meteorology.js";
import { resolveTodayIndex } from "../../domain/forecastToday.js";
import {
  formatTemperatureValue,
  formatTemperatureWithUnit,
} from "../../utils/temperature.js";
import {
  isMissingPlaceholder,
  MISSING_VALUE_PLACEHOLDER,
  toFiniteNumber,
} from "../../utils/numbers.js";
import { formatWindSpeed } from "../../domain/wind.js";
import { formatPrecipitation } from "../../utils/weatherUnits.js";
import {
  formatSunClock,
  formatDaylightLengthLabel,
  getSunlightPhase,
  getZonedNowMs,
  isDaylight,
} from "../../utils/sunlight.js";
import { formatDisplayCountry } from "../../utils/locationDisplay.js";
import { buildAtmosphereReading } from "./buildAtmosphereReading.js";

const FALLBACK_LOCATION_NAME = "Current location";
const FALLBACK_DATE_LABEL = "today";
const DEFAULT_SAMPLE_YEARS = 30;
const RAIN_GEAR_CHANCE_THRESHOLD = 55;
const SHOWER_CHANCE_THRESHOLD = 30;
const MEANINGFUL_RAIN_AMOUNT_IN = 0.08;
const BREEZY_WIND_MPH = 18;
const GUSTY_WIND_MPH = 30;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickLocationName(location) {
  return trimString(location?.name) || FALLBACK_LOCATION_NAME;
}

function pickLocationCountry(location) {
  return formatDisplayCountry(location?.country);
}

function todayLocaleString(nowMs, timeZone) {
  // Caller is responsible for passing a real timestamp. We do NOT
  // fall back to Date.now() here because this helper runs inside a
  // useMemo factory in HeroCard.jsx, and reading a mutable global
  // there would violate react-hooks/purity.
  //
  // timeZone is sourced from weather.meta.timezone so a user viewing
  // Tokyo from Chicago sees Tokyo's day name, not Chicago's. An
  // unrecognized tz falls back to the device's local zone — passing
  // an invalid timeZone string to toLocaleDateString throws on some
  // engines, so we feature-detect and retry without it.
  const referenceTime = toFiniteNumber(nowMs);
  if (referenceTime === null) {
    return "today";
  }
  const date = new Date(referenceTime);
  const baseOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  if (typeof timeZone === "string" && timeZone.trim()) {
    try {
      return date.toLocaleDateString("en-US", {
        ...baseOptions,
        timeZone: timeZone.trim(),
      });
    } catch {
      // Fall through to the device-local format below.
    }
  }
  return date.toLocaleDateString("en-US", baseOptions);
}

// Show the climate context line only when today is notably different
// from the historical norm. A 1-degree delta is statistical noise to
// most readers; surface the comparison only when the magnitude crosses
// a threshold that justifies the line.
const CLIMATE_NOTABLE_DELTA_F = 5;

function buildClimateMessage({
  climateComparison,
  unit,
  locationName,
}) {
  if (!climateComparison || typeof climateComparison !== "object") {
    return { hasClimateComparison: false, climateMessage: "" };
  }

  const climateDelta = toFiniteNumber(climateComparison.difference);
  if (climateDelta === null) {
    return { hasClimateComparison: false, climateMessage: "" };
  }

  if (Math.abs(climateDelta) < CLIMATE_NOTABLE_DELTA_F) {
    return { hasClimateComparison: false, climateMessage: "" };
  }

  const sampleYears = toFiniteNumber(climateComparison.sampleYears);
  const climateSource = `${sampleYears ?? DEFAULT_SAMPLE_YEARS}-year`;
  const climateDate =
    trimString(climateComparison.referenceDateLabel) || FALLBACK_DATE_LABEL;
  const climateLocation = locationName || "this location";
  const tempUnit = unit === "C" ? "°C" : "°F";

  const direction = climateDelta > 0 ? "warmer" : "colder";

  // Convert the absolute delta into the user's chosen unit. The raw
  // delta is in Fahrenheit (always); the visible delta should match
  // whatever °F/°C they have selected.
  const absDelta = Math.abs(climateDelta);
  const convertedDelta = unit === "C" ? (absDelta * 5) / 9 : absDelta;
  const climateDeltaDisplay = String(Math.round(convertedDelta));

  return {
    hasClimateComparison: true,
    climateMessage: `Today is ${climateDeltaDisplay}${tempUnit} ${direction} than the ${climateSource} average for ${climateDate} in ${climateLocation}.`,
  };
}

function formatPercent(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? "" : `${Math.round(numeric)}%`;
}

function buildRainGuidance(weather, unit, todayIndex) {
  const chance = toFiniteNumber(weather?.daily?.rainChanceMax?.[todayIndex]);
  const amount = toFiniteNumber(weather?.daily?.rainAmountTotal?.[todayIndex]);
  const chanceLabel = formatPercent(chance);
  // Wire amounts are pinned to inches (source "F") regardless of the
  // display unit; only the rendered label converts to the user's unit.
  const amountLabel = formatPrecipitation(amount, unit, "F");

  if (chance === null && amount === null) {
    return {
      kind: "rain",
      tone: "unavailable",
      label: "Rain",
      value: "Guidance unavailable",
      detail: "Precipitation data did not return",
    };
  }

  if (
    (chance !== null && chance >= RAIN_GEAR_CHANCE_THRESHOLD) ||
    (amount !== null && amount >= MEANINGFUL_RAIN_AMOUNT_IN)
  ) {
    return {
      kind: "rain",
      tone: "watch",
      label: "Rain",
      value: "Bring rain gear",
      detail: chanceLabel
        ? `${chanceLabel} peak chance today`
        : `${amountLabel} expected today`,
    };
  }

  if (
    (chance !== null && chance >= SHOWER_CHANCE_THRESHOLD) ||
    (amount !== null && amount > 0)
  ) {
    return {
      kind: "rain",
      tone: "notice",
      label: "Rain",
      value: "Possible showers",
      detail: chanceLabel
        ? `${chanceLabel} peak chance today`
        : `${amountLabel} expected today`,
    };
  }

  return {
    kind: "rain",
    tone: "calm",
    label: "Rain",
    value: "Dry window",
    detail: chanceLabel ? `${chanceLabel} peak chance today` : "Low rain signal",
  };
}

function buildUvGuidance(weather, todayIndex, sunWindow) {
  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[todayIndex]);

  // Missing data is reported before the daylight gate, deliberately. A
  // reading that did not arrive is a trust-contract signal the reader is
  // owed at any hour; only *advice* is time-bound.
  if (uvIndex === null) {
    return {
      kind: "uv",
      tone: "unavailable",
      label: "UV",
      value: "UV unavailable",
      detail: "Sun exposure data did not return",
    };
  }

  /*
   * Audit finding 22, the correctness half. This pill is present-tense
   * advice — "Use sun protection", "Very high exposure" — and it rendered
   * at midnight. The hero's reading line has always gated its own UV note
   * on daylight ("Only surface during daylight"); this applies that same
   * rule, through the same helper, so the two cannot disagree. Outside
   * daylight there is nothing to advise, so the pill is dropped rather
   * than narrated — the same philosophy as hiding calm-tone pills.
   */
  if (!isDaylight(sunWindow?.sunrise, sunWindow?.sunset, sunWindow?.zonedNowMs)) {
    return null;
  }

  const uvLabel = `Peak UV ${uvIndex.toFixed(1)}`;
  const uvBand = classifyUv(uvIndex).band;
  if (uvBand === "very-high" || uvBand === "extreme") {
    return {
      kind: "uv",
      tone: "watch",
      label: "UV",
      value: "Very high exposure",
      detail: uvLabel,
    };
  }

  if (uvBand === "high") {
    return {
      kind: "uv",
      tone: "notice",
      label: "UV",
      value: "Use sun protection",
      detail: uvLabel,
    };
  }

  if (uvBand === "moderate") {
    return {
      kind: "uv",
      tone: "notice",
      label: "UV",
      value: "Moderate exposure",
      detail: uvLabel,
    };
  }

  return {
    kind: "uv",
    tone: "calm",
    label: "UV",
    value: "Low exposure",
    detail: uvLabel,
  };
}

// Marker geometry only — band classification lives in domain/exposure
// (classifyUv), the one UV scale every surface shares.
const UV_SCALE_MAX = 11;

// Panel copy per shared UV band. Level words stay sentence case to
// match the hero's typographic voice ("Very high", not "Very High").
const UV_PANEL_COPY = {
  extreme: {
    level: "Extreme",
    head: "Avoid the midday sun",
    advice: "shade, hat & SPF are essential",
    line: "Extreme UV today — cover up and limit midday exposure.",
  },
  "very-high": {
    level: "Very high",
    head: "Cover up outdoors",
    advice: "hat, shade & SPF around midday",
    line: "Very high UV today — protect your skin midday.",
  },
  high: {
    level: "High",
    head: "Use sun protection",
    advice: "hat & SPF if you're out midday",
    line: "High UV today — sun protection is worth it midday.",
  },
  moderate: {
    level: "Moderate",
    head: "Some protection helps",
    advice: "seek shade through midday",
    line: "Moderate UV today — easy on the sun exposure.",
  },
  low: {
    level: "Low",
    head: "Minimal protection needed",
    advice: "no special protection required",
    line: "Low UV today — comfortable to be outside.",
  },
};

/*
 * Hero UV index panel data. Reads the raw daily peak directly (NOT the
 * filtered dailyGuidance, which drops "calm"/low-UV days) so the panel
 * renders for EVERY UV level. Returns null when the reading is missing
 * — the trust contract says drop the whole panel rather than paint an
 * empty graded bar. Level word + guidance copy are keyed off the shared
 * classifyUv band, so the panel, the chip, and the one-liner never
 * disagree (the mockup itself ships a "Moderate" label over a 7.5
 * reading — data-driven copy fixes that).
 */
function buildHeroUvPanel(weather, todayIndex) {
  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[todayIndex]);
  if (uvIndex === null) {
    return null;
  }

  const peak = Math.max(0, uvIndex);
  const peakLabel = `Peak UV ${peak.toFixed(1)}`;
  // Linear placement on the 0–11+ bar — matches the mockup marker
  // (7.5 → ~68%). Clamp so 11+ pins to the Extreme end.
  const markerPct = Math.max(0, Math.min(100, (peak / UV_SCALE_MAX) * 100));

  const { level, head, advice, line } = UV_PANEL_COPY[classifyUv(peak).band];

  return {
    peak,
    peakLabel,
    head,
    sub: `${peakLabel} — ${advice}.`,
    line,
    level,
    markerPct,
  };
}

function buildWindGuidance(weather, unit) {
  const windSpeed = toFiniteNumber(weather?.current?.windSpeed);
  const windGust = toFiniteNumber(weather?.current?.windGust);

  // Validate, then compute. The old order derived `strongestWind` from
  // `Math.max(windSpeed ?? 0, windGust ?? 0)` above this guard, which reads
  // like a fabricated 0 mph waiting to happen. It never was one: the guard
  // returned first when both readings were missing, and with one present the
  // `?? 0` could only lose to the real value, wind being non-negative. This
  // order means nobody has to reconstruct that argument to trust the function.
  const readings = [windSpeed, windGust].filter((reading) => reading !== null);
  if (readings.length === 0) {
    return {
      kind: "wind",
      tone: "unavailable",
      label: "Wind",
      value: "Wind unavailable",
      detail: "Surface wind data did not return",
    };
  }

  const strongestWind = Math.max(...readings);

  if (strongestWind >= GUSTY_WIND_MPH) {
    return {
      kind: "wind",
      tone: "watch",
      label: "Wind",
      value: "Gusty conditions",
      detail: `Gusts ${formatWindSpeed(strongestWind, unit)}`,
    };
  }

  if (strongestWind >= BREEZY_WIND_MPH) {
    return {
      kind: "wind",
      tone: "notice",
      label: "Wind",
      value: "Breezy",
      detail: `Up to ${formatWindSpeed(strongestWind, unit)}`,
    };
  }

  return {
    kind: "wind",
    tone: "calm",
    label: "Wind",
    value: "Comfortable wind",
    detail: `Up to ${formatWindSpeed(strongestWind, unit)}`,
  };
}

/*
 * Returns only the guidance items that warrant the user's attention.
 * "calm" tones (dry window / low UV / comfortable wind) used to render
 * three reassuring pills under the hero on every calm day — the same
 * non-event narration the audit flagged for AlertsCard and the storm
 * "Calm" copy. We surface guidance only when the weather is actually
 * doing something the user might decide on (notice / watch tones), or
 * when a reading is missing (unavailable) so the trust contract stays
 * honest.
 */
function buildDailyGuidance(weather, unit, todayIndex, sunWindow) {
  return [
    buildRainGuidance(weather, unit, todayIndex),
    buildUvGuidance(weather, todayIndex, sunWindow),
    buildWindGuidance(weather, unit),
  ]
    // A builder returns null when it has nothing timely to say (UV after
    // dark); calm-tone entries are non-events. Neither earns a pill.
    .filter((item) => item && item.tone !== "calm");
}

const WIND_CALM_MPH = 5;
const WIND_BREEZY_MPH = 12;
const WIND_GUSTY_MPH = 25;
const AQI_GOOD = 50;
const AQI_MODERATE = 100;

function buildCharacteristicChips(weather, aqi, todayIndex) {
  const chips = [];

  const dewPoint = toFiniteNumber(weather?.current?.dewPoint);
  if (dewPoint !== null) {
    // dewPoint is always sourced in °F — the forecast is fetched in Fahrenheit
    // regardless of the display unit (useWeatherData API_TEMPERATURE_UNIT) — and the
    // comfort thresholds below are defined in °F, so classify the raw value. Do NOT
    // re-convert by display unit; that double-converts an already-°F reading and
    // mislabels comfort for every °C user.
    /*
     * Audit finding 23. This chip carried its own cutoffs (45 / 65) while
     * the dew-point tile directly below it is labelled by classifyComfort
     * (50 / 55 / 60 / 65 / 70 / 75). They agreed at exactly one boundary,
     * so the same reading got contradictory words: 47° was "Comfortable"
     * here and "Dry" on the tile, and 62° was "Comfortable" here over a
     * tile saying "Sticky" — opposites, one above the other.
     *
     * The chip keeps its three words and takes its band from the shared
     * classifier, the same resolution the UV surfaces already use ("the one
     * UV scale every surface shares"). Dry → "Dry air"; Comfortable and
     * Pleasant → "Comfortable"; everything from Sticky up → "Muggy".
     */
    const { level } = classifyComfort(dewPoint, "F");
    if (level !== "Unknown") {
      chips.push({
        id: "comfort",
        icon: "droplets",
        label:
          level === "Dry"
            ? "Dry air"
            : level === "Comfortable" || level === "Pleasant"
            ? "Comfortable"
            : "Muggy",
      });
    }
  }

  const windSpeed = toFiniteNumber(weather?.current?.windSpeed);
  if (windSpeed !== null) {
    // windSpeed is always sourced in mph (getApiWindSpeedUnit() === "mph") and the wind
    // thresholds below are defined in mph, so classify the raw value. Do NOT re-convert
    // by display unit; that shrinks an already-mph reading and mislabels wind severity.
    const wMph = windSpeed;
    chips.push({
      id: "wind",
      icon: "wind",
      label:
        wMph >= WIND_GUSTY_MPH
          ? "Gusty"
          : wMph >= WIND_BREEZY_MPH
          ? "Breezy"
          : wMph <= WIND_CALM_MPH
          ? "Calm air"
          : "Light breeze",
    });
  }

  const aqiValue = toFiniteNumber(aqi);
  if (aqiValue !== null) {
    chips.push({
      id: "aqi",
      icon: "leaf",
      label:
        aqiValue <= AQI_GOOD
          ? "Air good"
          : aqiValue <= AQI_MODERATE
          ? "Air fair"
          : "Air poor",
    });
  }

  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[todayIndex]);
  if (uvIndex !== null) {
    // Chip casing is "UV <band>", derived from the shared classifier so
    // the chip word can never drift from the panel/reading-line band.
    const uvBand = classifyUv(uvIndex);
    chips.push({
      id: "uv",
      icon: "sun",
      label: `UV ${uvBand.label.toLowerCase()}`,
    });
  }

  return chips;
}

/**
 * Pure data shaping for HeroCard. Returns the full set of display
 * strings the component needs, or null when the inputs cannot
 * support a render. The returned object is plain data (no closures)
 * so it is safe to memo and easy to unit-test.
 */
export function buildHeroData({
  weather,
  location,
  unit,
  climateComparison,
  nowMs,
  aqi = null,
} = {}) {
  if (!weather?.current || !location) {
    return null;
  }

  const current = weather.current;
  /*
   * Which daily entry is today. Read index 0 and a snapshot restored from
   * yesterday puts yesterday's high, low, sun times and UV peak in the hero
   * while the Week Ahead below it starts at today. See resolveTodayIndex.
   */
  const todayIndex = resolveTodayIndex(weather, nowMs);
  const safeLocationName = pickLocationName(location);
  const safeLocationCountry = pickLocationCountry(location);
  const info = getWeather(current.conditionCode);
  const tempUnit = unit === "C" ? "°C" : "°F";

  const currentTempDisplay = formatTemperatureValue(current.temperature, unit);
  const feelsLikeDisplay = formatTemperatureWithUnit(current.feelsLike, unit);
  const dewPointDisplay = formatTemperatureWithUnit(current.dewPoint, unit);
  const todayHighDisplay = formatTemperatureWithUnit(
    weather?.daily?.temperatureMax?.[todayIndex],
    unit
  );
  const todayLowDisplay = formatTemperatureWithUnit(
    weather?.daily?.temperatureMin?.[todayIndex],
    unit
  );

  const windDisplay = formatWindSpeed(current.windSpeed, unit);

  const humidityValue = toFiniteNumber(current.humidity);
  const humidityDisplay =
    humidityValue === null
      ? MISSING_VALUE_PLACEHOLDER
      : `${Math.round(humidityValue)}%`;
  const pressureValue = toFiniteNumber(current.pressure);
  const pressureDisplay =
    pressureValue === null
      ? MISSING_VALUE_PLACEHOLDER
      : `${Math.round(pressureValue)} hPa`;

  const sunriseValue = weather?.daily?.sunrise?.[todayIndex] ?? "";
  const sunsetValue = weather?.daily?.sunset?.[todayIndex] ?? "";
  const sunriseLabel = formatSunClock(sunriseValue);
  const sunsetLabel = formatSunClock(sunsetValue);
  const daylightLabel = formatDaylightLengthLabel(sunriseValue, sunsetValue, {
    fallback: MISSING_VALUE_PLACEHOLDER,
  });
  // The golden-hour phase compares "now" against the location's naive
  // sunrise/sunset timestamps, so it must use the location's wall clock
  // (not the device's) to avoid mistiming the warm wash for remote
  // cities. The date label below intentionally keeps the real nowMs —
  // todayLocaleString formats that instant *into* the location's zone.
  const zonedNowMs = getZonedNowMs(weather?.meta?.timezone, nowMs);
  const sunlightPhase = getSunlightPhase(sunriseValue, sunsetValue, zonedNowMs);
  const atmosphereReading = buildAtmosphereReading({ weather, nowMs, unit });

  const { hasClimateComparison, climateMessage } = buildClimateMessage({
    climateComparison,
    unit,
    locationName: safeLocationName,
  });
  const dailyGuidance = buildDailyGuidance(weather, unit, todayIndex, {
    sunrise: sunriseValue,
    sunset: sunsetValue,
    zonedNowMs,
  });

  const isCurrentTempMissing = isMissingPlaceholder(currentTempDisplay);
  // The headline condition is "missing" exactly when getWeather fell back to
  // UNKNOWN_WEATHER (absent or unrecognised code) — the same descriptor whose
  // label renders as "Not reported". Identity check, because getWeather returns
  // that object by reference. Paired with isCurrentTempMissing so the hero can
  // tell when either half of its headline is absent.
  const isConditionMissing = info === UNKNOWN_WEATHER;
  const heroStatsHaveAnyMissing = [
    humidityDisplay,
    pressureDisplay,
    dewPointDisplay,
    windDisplay,
  ].some((value) => isMissingPlaceholder(value));

  const characteristicChips = buildCharacteristicChips(weather, aqi, todayIndex);

  return {
    current,
    info,
    tempUnit,
    safeLocationName,
    safeLocationCountry,
    currentTempDisplay,
    isCurrentTempMissing,
    isConditionMissing,
    feelsLikeDisplay,
    dewPointDisplay,
    todayHighDisplay,
    todayLowDisplay,
    windDisplay,
    humidityDisplay,
    pressureDisplay,
    heroStatsHaveAnyMissing,
    sunriseValue,
    sunsetValue,
    sunriseLabel,
    sunsetLabel,
    daylightLabel,
    sunlightPhase,
    atmosphereReading,
    hasClimateComparison,
    climateMessage,
    dailyGuidance,
    characteristicChips,
    uvPanel: buildHeroUvPanel(weather, todayIndex),
    today: todayLocaleString(nowMs, weather?.meta?.timezone),
  };
}
