import { getWeather } from "../../domain/weatherCodes.js";
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
} from "../../utils/sunlight.js";
import { getZonedNow } from "../../utils/dates.js";
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

function buildRainGuidance(weather) {
  const chance = toFiniteNumber(weather?.daily?.rainChanceMax?.[0]);
  const amount = toFiniteNumber(weather?.daily?.rainAmountTotal?.[0]);
  const chanceLabel = formatPercent(chance);
  const amountLabel = formatPrecipitation(amount, "F", "F");

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

function buildUvGuidance(weather) {
  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[0]);

  if (uvIndex === null) {
    return {
      kind: "uv",
      tone: "unavailable",
      label: "UV",
      value: "UV unavailable",
      detail: "Sun exposure data did not return",
    };
  }

  const uvLabel = `Peak UV ${uvIndex.toFixed(1)}`;
  if (uvIndex >= 8) {
    return {
      kind: "uv",
      tone: "watch",
      label: "UV",
      value: "Very high exposure",
      detail: uvLabel,
    };
  }

  if (uvIndex >= 6) {
    return {
      kind: "uv",
      tone: "notice",
      label: "UV",
      value: "Use sun protection",
      detail: uvLabel,
    };
  }

  if (uvIndex >= 3) {
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

// UV severity bands (peak index), matching the spec's 0–11+ scale:
// Low 0–2 · Moderate 3–5 · High 6–7 · Very high 8–10 · Extreme 11+.
// Shared by the hero UV panel so the level word, marker, and ticks
// agree with the characteristic-chip and guidance thresholds above.
const UV_MODERATE_MIN = 3;
const UV_HIGH_MIN = 6;
const UV_VERY_HIGH_MIN = 8;
const UV_EXTREME_MIN = 11;
const UV_SCALE_MAX = 11;

/*
 * Hero UV index panel data. Reads the raw daily peak directly (NOT the
 * filtered dailyGuidance, which drops "calm"/low-UV days) so the panel
 * renders for EVERY UV level. Returns null when the reading is missing
 * — the trust contract says drop the whole panel rather than paint an
 * empty graded bar. Level word + guidance copy are derived from the
 * same severity bands as buildUvGuidance/the UV chip, so the panel,
 * the chip, and the one-liner never disagree (the mockup itself ships
 * a "Moderate" label over a 7.5 reading — data-driven copy fixes that).
 */
function buildHeroUvPanel(weather) {
  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[0]);
  if (uvIndex === null) {
    return null;
  }

  const peak = Math.max(0, uvIndex);
  const peakLabel = `Peak UV ${peak.toFixed(1)}`;
  // Linear placement on the 0–11+ bar — matches the mockup marker
  // (7.5 → ~68%). Clamp so 11+ pins to the Extreme end.
  const markerPct = Math.max(0, Math.min(100, (peak / UV_SCALE_MAX) * 100));

  let level;
  let head;
  let advice;
  let line;
  if (peak >= UV_EXTREME_MIN) {
    level = "Extreme";
    head = "Avoid the midday sun";
    advice = "shade, hat & SPF are essential";
    line = "Extreme UV today — cover up and limit midday exposure.";
  } else if (peak >= UV_VERY_HIGH_MIN) {
    level = "Very high";
    head = "Cover up outdoors";
    advice = "hat, shade & SPF around midday";
    line = "Very high UV today — protect your skin midday.";
  } else if (peak >= UV_HIGH_MIN) {
    level = "High";
    head = "Use sun protection";
    advice = "hat & SPF if you're out midday";
    line = "High UV today — sun protection is worth it midday.";
  } else if (peak >= UV_MODERATE_MIN) {
    level = "Moderate";
    head = "Some protection helps";
    advice = "seek shade through midday";
    line = "Moderate UV today — easy on the sun exposure.";
  } else {
    level = "Low";
    head = "Minimal protection needed";
    advice = "no special protection required";
    line = "Low UV today — comfortable to be outside.";
  }

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
  const strongestWind = Math.max(windSpeed ?? 0, windGust ?? 0);

  if (windSpeed === null && windGust === null) {
    return {
      kind: "wind",
      tone: "unavailable",
      label: "Wind",
      value: "Wind unavailable",
      detail: "Surface wind data did not return",
    };
  }

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
function buildDailyGuidance(weather, unit) {
  return [
    buildRainGuidance(weather),
    buildUvGuidance(weather),
    buildWindGuidance(weather, unit),
  ].filter((item) => item.tone !== "calm");
}

const DEW_POINT_MUGGY_F = 65;
const DEW_POINT_DRY_F = 45;
const WIND_CALM_MPH = 5;
const WIND_BREEZY_MPH = 12;
const WIND_GUSTY_MPH = 25;
const AQI_GOOD = 50;
const AQI_MODERATE = 100;

function buildCharacteristicChips(weather, unit, aqi) {
  const chips = [];

  const dewPoint = toFiniteNumber(weather?.current?.dewPoint);
  if (dewPoint !== null) {
    const dpF = unit === "C" ? dewPoint * 9 / 5 + 32 : dewPoint;
    chips.push({
      id: "comfort",
      icon: "droplets",
      label:
        dpF >= DEW_POINT_MUGGY_F
          ? "Muggy"
          : dpF <= DEW_POINT_DRY_F
          ? "Dry air"
          : "Comfortable",
    });
  }

  const windSpeed = toFiniteNumber(weather?.current?.windSpeed);
  if (windSpeed !== null) {
    const wMph = unit === "C" ? windSpeed * 0.621371 : windSpeed;
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

  const uvIndex = toFiniteNumber(weather?.daily?.uvIndexMax?.[0]);
  if (uvIndex !== null) {
    chips.push({
      id: "uv",
      icon: "sun",
      label:
        uvIndex >= 8
          ? "UV very high"
          : uvIndex >= 6
          ? "UV high"
          : uvIndex >= 3
          ? "UV moderate"
          : "UV low",
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
  const safeLocationName = pickLocationName(location);
  const safeLocationCountry = pickLocationCountry(location);
  const info = getWeather(current.conditionCode);
  const tempUnit = unit === "C" ? "°C" : "°F";

  const currentTempDisplay = formatTemperatureValue(current.temperature, unit);
  const feelsLikeDisplay = formatTemperatureWithUnit(current.feelsLike, unit);
  const dewPointDisplay = formatTemperatureWithUnit(current.dewPoint, unit);
  const todayHighDisplay = formatTemperatureWithUnit(
    weather?.daily?.temperatureMax?.[0],
    unit
  );
  const todayLowDisplay = formatTemperatureWithUnit(
    weather?.daily?.temperatureMin?.[0],
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

  const sunriseValue = weather?.daily?.sunrise?.[0] ?? "";
  const sunsetValue = weather?.daily?.sunset?.[0] ?? "";
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
  const zonedNowMs =
    nowMs == null ? null : getZonedNow(weather?.meta?.timezone, nowMs).getTime();
  const sunlightPhase = getSunlightPhase(sunriseValue, sunsetValue, zonedNowMs);
  const atmosphereReading = buildAtmosphereReading({ weather, nowMs, unit });

  const { hasClimateComparison, climateMessage } = buildClimateMessage({
    climateComparison,
    unit,
    locationName: safeLocationName,
  });
  const dailyGuidance = buildDailyGuidance(weather, unit);

  const isCurrentTempMissing = isMissingPlaceholder(currentTempDisplay);
  const heroStatsHaveAnyMissing = [
    humidityDisplay,
    pressureDisplay,
    dewPointDisplay,
    windDisplay,
  ].some((value) => isMissingPlaceholder(value));

  const characteristicChips = buildCharacteristicChips(weather, unit, aqi);

  return {
    current,
    info,
    tempUnit,
    safeLocationName,
    safeLocationCountry,
    currentTempDisplay,
    isCurrentTempMissing,
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
    uvPanel: buildHeroUvPanel(weather),
    today: todayLocaleString(nowMs, weather?.meta?.timezone),
  };
}
