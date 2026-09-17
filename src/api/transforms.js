import { createEmptyWeatherModel } from "./types.js";
import { toFiniteNumber } from "../utils/numbers.js";

const DEFAULT_TIMEZONE = "UTC";

export function normalizeTimeZone(value, fallback = DEFAULT_TIMEZONE) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

const toNumber = toFiniteNumber;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

// A provider timestamp is kept as the string the provider sent — the
// location's wall clock, e.g. "2026-09-16T19:30" — never parsed here. An
// empty or non-string value is missing.
function asTimestamp(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/*
 * Open-Meteo declares the unit of every series it returns (`current_units`,
 * `hourly_units`, `minutely_15_units`), and the app cannot assume one.
 * Visibility is documented in metres, but the provider switches it to FEET
 * whenever the request asks for `precipitation_unit=inch` — which this app
 * always does. Nothing read the declared unit, so the Atmosphere tile divided
 * a 48,885 ft reading by 1,609 as though it were metres and printed
 * "30 mi · clear" on a nine-mile day; fog at one mile rendered as three. The
 * model therefore carries visibility in METRES, converted here from whatever
 * unit the provider declared.
 *
 * A payload with no declared unit (fixtures, older mocks) is taken as the
 * documented default, metres. A declared unit this table does not know is
 * treated as missing data: an unreadable unit must render "—", never a
 * number in the wrong unit.
 */
const VISIBILITY_METRES_PER_UNIT = {
  m: 1,
  ft: 0.3048,
};

export function normalizeVisibility(value, unit) {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  if (unit === undefined || unit === null) {
    return numeric;
  }
  const factor =
    typeof unit === "string"
      ? VISIBILITY_METRES_PER_UNIT[unit.trim().toLowerCase()]
      : undefined;
  return factor === undefined ? null : numeric * factor;
}

/*
 * ── The unit contract ─────────────────────────────────────────────────────
 *
 * Visibility is converted. Everything else is *assumed*, and the assumption
 * has been wrong three times: the feet-for-metres bug above, station pressure
 * read as sea-level, and precipitation read in the wrong unit. All three
 * shared one shape — a number arrived in a unit nobody checked, and every
 * layer downstream treated it as the unit it expected. A wrong unit is the
 * worst failure this app has, because it is the only one that produces a
 * plausible number. "30 mi · clear" on a nine-mile day looks like data.
 *
 * `types.js` already stated the invariant in prose: temperatures °F, wind
 * speeds mph, precipitation inches, pressure hPa. Prose does not fail a
 * build. This is the same statement as a check.
 *
 * The values are what the live API returns for the request `fetchWeather`
 * builds, read off a real response on 2026-09-17 rather than from the docs —
 * note `mp/h`, which is Open-Meteo's spelling and not `mph`. A table written
 * from memory would have been wrong on its first field.
 *
 * Scope, and why each is in or out:
 *
 *   in  — every series whose NUMBER a downstream layer interprets against a
 *         threshold: temperatures, wind speeds, pressure, precipitation,
 *         percentages, CAPE.
 *   out — `visibility`, deliberately. Its declared unit is an input to
 *         `normalizeVisibility`, not a thing to assert; pinning it to "ft"
 *         would break the documented metres default.
 *   out — `time` ("iso8601"), `weather_code` ("wmo code"), `uv_index` and
 *         `is_day` (both ""), which carry no magnitude to misread.
 *
 * A field the payload does not declare is skipped, not failed: fixtures and
 * hand-built mocks carry no `*_units` block and are not wrong, merely silent.
 * A field that IS declared and disagrees throws, naming both units — the
 * request is refused rather than rendered, because the trust contract's whole
 * position is that a plausible wrong number is worse than no number.
 */
const EXPECTED_UNITS = {
  current: {
    temperature_2m: "°F",
    apparent_temperature: "°F",
    dew_point_2m: "°F",
    wind_speed_10m: "mp/h",
    wind_gusts_10m: "mp/h",
    pressure_msl: "hPa",
    relative_humidity_2m: "%",
    cloud_cover: "%",
  },
  hourly: {
    temperature_2m: "°F",
    apparent_temperature: "°F",
    dew_point_2m: "°F",
    wind_speed_10m: "mp/h",
    wind_gusts_10m: "mp/h",
    pressure_msl: "hPa",
    relative_humidity_2m: "%",
    precipitation: "inch",
    precipitation_probability: "%",
    cape: "J/kg",
  },
  minutely_15: {
    precipitation: "inch",
    precipitation_probability: "%",
  },
};

/**
 * Thrown when the provider declares a unit the model is not denominated in.
 *
 * A distinct name so a caller can tell a contract breach from a network
 * failure: one is retryable, the other will fail identically forever.
 */
export class UnitContractError extends Error {
  /**
   * @param {string} section  "current", "hourly" or "minutely_15"
   * @param {string} field    the provider's field name
   * @param {string} declared the unit the payload declared
   * @param {string} expected the unit this model reads it as
   */
  constructor(section, field, declared, expected) {
    super(
      `Open-Meteo declared ${section}.${field} in "${declared}", but this ` +
        `model reads it as "${expected}". Refusing the payload: a reading in ` +
        `the wrong unit renders as a plausible number, not as missing data.`
    );
    this.name = "UnitContractError";
    this.section = section;
    this.field = field;
    this.declared = declared;
    this.expected = expected;
  }
}

/**
 * Checks one declared-units block against what this model reads.
 *
 * @param {Record<string, unknown>} declared the payload's `*_units` object
 * @param {Record<string, string>} expected  the matching EXPECTED_UNITS entry
 * @param {string} section                   name used in the error
 * @throws {UnitContractError} on the first field that disagrees
 */
function assertDeclaredUnits(declared, expected, section) {
  for (const [field, want] of Object.entries(expected)) {
    const got = declared[field];
    // Undeclared is not wrong. Only a stated unit can contradict.
    if (got === undefined || got === null) {
      continue;
    }
    const normalized = typeof got === "string" ? got.trim() : String(got);
    if (normalized !== want) {
      throw new UnitContractError(section, field, normalized, want);
    }
  }
}

/** The declared units, kept on the model so a reader can see them. */
function readDeclaredUnits(units, expected) {
  /** @type {Record<string, string>} */
  const carried = {};
  for (const field of Object.keys(expected)) {
    const value = units[field];
    if (typeof value === "string" && value.trim()) {
      carried[field] = value.trim();
    }
  }
  return carried;
}

/**
 * Maps Open-Meteo payload into a stable app-domain weather model.
 * @param {any} raw
 * @returns {import("./types.js").AppWeatherModel}
 */
export function normalizeWeatherResponse(raw) {
  const model = createEmptyWeatherModel();
  const safe = asObject(raw);
  const current = asObject(safe.current);
  const currentUnits = asObject(safe.current_units);
  const hourly = asObject(safe.hourly);
  const hourlyUnits = asObject(safe.hourly_units);
  const daily = asObject(safe.daily);
  const minutely = asObject(safe.minutely_15);
  const minutelyUnits = asObject(safe.minutely_15_units);

  // Before anything is read. A payload in the wrong unit must not reach the
  // model at all — half a model built from it is worse than none.
  assertDeclaredUnits(currentUnits, EXPECTED_UNITS.current, "current");
  assertDeclaredUnits(hourlyUnits, EXPECTED_UNITS.hourly, "hourly");
  assertDeclaredUnits(minutelyUnits, EXPECTED_UNITS.minutely_15, "minutely_15");

  return {
    ...model,
    meta: {
      ...model.meta,
      latitude: toNumber(safe.latitude),
      longitude: toNumber(safe.longitude),
      timezone: normalizeTimeZone(safe.timezone),
      utcOffsetSeconds: toNumber(safe.utc_offset_seconds),
      // What the provider said, not what we assumed. Empty for a payload
      // that declared nothing, which is every fixture and hand-built mock.
      units: {
        current: readDeclaredUnits(currentUnits, EXPECTED_UNITS.current),
        hourly: readDeclaredUnits(hourlyUnits, EXPECTED_UNITS.hourly),
        // The one unit the model converts rather than asserts, kept so a
        // reader can see which side of normalizeVisibility they are on.
        visibility: {
          current:
            typeof currentUnits.visibility === "string"
              ? currentUnits.visibility
              : null,
          hourly:
            typeof hourlyUnits.visibility === "string"
              ? hourlyUnits.visibility
              : null,
        },
      },
    },
    current: {
      ...model.current,
      // "Current" conditions are model output on a 15-minute grid, valid
      // at `time` (the location's wall clock) for `interval` seconds. The
      // model dropped both, so the only clock the hero could show was the
      // fetch time — a 4:59 pm fetch presented 4:45 pm values as "just now".
      time: asTimestamp(current.time),
      interval: toNumber(current.interval),
      temperature: toNumber(current.temperature_2m),
      humidity: toNumber(current.relative_humidity_2m),
      feelsLike: toNumber(current.apparent_temperature),
      conditionCode: toNumber(current.weather_code),
      windSpeed: toNumber(current.wind_speed_10m),
      windGust: toNumber(current.wind_gusts_10m),
      windDirection: toNumber(current.wind_direction_10m),
      // Mean-sea-level pressure (hPa), the figure other weather sources
      // quote. The request used to ask for station pressure, which sits
      // ~21 hPa lower at the default city's 183 m and made the gauge read
      // wrong against every barometer. Deliberately no fallback to
      // `surface_pressure`: a station reading on a sea-level gauge is the
      // bug this replaces, so a payload without `pressure_msl` is missing.
      pressure: toNumber(current.pressure_msl),
      dewPoint: toNumber(current.dew_point_2m),
      cloudCover: toNumber(current.cloud_cover),
      visibility: normalizeVisibility(
        current.visibility,
        currentUnits.visibility
      ),
      isDay: toNumber(current.is_day),
    },
    hourly: {
      ...model.hourly,
      time: asArray(hourly.time),
      temperature: asArray(hourly.temperature_2m),
      conditionCode: asArray(hourly.weather_code),
      rainChance: asArray(hourly.precipitation_probability),
      rainAmount: asArray(hourly.precipitation),
      pressure: asArray(hourly.pressure_msl),
      cape: asArray(hourly.cape),
      windSpeed: asArray(hourly.wind_speed_10m),
      windGust: asArray(hourly.wind_gusts_10m),
      windDirection: asArray(hourly.wind_direction_10m),
      humidity: asArray(hourly.relative_humidity_2m),
      dewPoint: asArray(hourly.dew_point_2m),
      feelsLike: asArray(hourly.apparent_temperature),
      uvIndex: asArray(hourly.uv_index),
      visibility: asArray(hourly.visibility).map((value) =>
        normalizeVisibility(value, hourlyUnits.visibility)
      ),
    },
    daily: {
      ...model.daily,
      time: asArray(daily.time),
      conditionCode: asArray(daily.weather_code),
      temperatureMax: asArray(daily.temperature_2m_max),
      temperatureMin: asArray(daily.temperature_2m_min),
      sunrise: asArray(daily.sunrise),
      sunset: asArray(daily.sunset),
      uvIndexMax: asArray(daily.uv_index_max),
      rainChanceMax: asArray(daily.precipitation_probability_max),
      rainAmountTotal: asArray(daily.precipitation_sum),
      windSpeedMax: asArray(daily.wind_speed_10m_max),
      windGustMax: asArray(daily.wind_gusts_10m_max),
      windDirectionDominant: asArray(daily.wind_direction_10m_dominant),
    },
    nowcast: {
      ...model.nowcast,
      time: asArray(minutely.time),
      conditionCode: asArray(minutely.weather_code),
      rainChance: asArray(minutely.precipitation_probability),
      rainAmount: asArray(minutely.precipitation),
    },
  };
}
