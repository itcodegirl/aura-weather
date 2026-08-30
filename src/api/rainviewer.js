// src/api/rainviewer.js
//
// RainViewer free public radar API adapter. One key-less endpoint
// (https://api.rainviewer.com/public/weather-maps.json) returns the
// catalogue of radar tile frames RainViewer currently holds:
//   radar.past[]      — observed frames
//   radar.nowcast[]   — short-range forecast frames (gated on the free
//                       tier and, in practice, frequently empty)
// Each frame is { time: <unix seconds>, path: "/v2/radar/<id>" }. Tiles
// are assembled from the response `host` + each frame's `path`.
//
// The trust contract lives here: this module never invents frames. If
// the response is unreachable, malformed, or carries no usable frames,
// the parser says so honestly (status 'error' / 'empty') and the UI
// degrades instead of faking a radar loop. Forecast (nowcast) frames are
// tagged distinctly from observed (past) frames so the UI can keep the
// two visually separate and never present a forecast frame as observed.

import {
  RADAR_FRAME_KIND,
  RADAR_STATUS,
} from "../domain/radar.js";
import { createRequestSignal, isAbortError } from "./requestSignal.js";

export const RAINVIEWER_WEATHER_MAPS_URL =
  "https://api.rainviewer.com/public/weather-maps.json";

const FETCH_TIMEOUT_MS = 10_000;

// Radar vocabulary lives in the domain layer so the radar components can read
// it without importing from here. Re-exported for this module’s existing
// consumers and tests.
export {
  RADAR_COLOR_SCHEME,
  RADAR_SMOOTH,
  RADAR_SNOW,
  RADAR_MAX_ZOOM,
  RADAR_FRAME_KIND,
  RADAR_STATUS,
  radarTileUrlTemplate,
} from "../domain/radar.js";

// Demo / QA overrides, read from the URL (`?radar=error|empty|loading|
// nocoverage`). They force an honest degraded state so each path can be
// shown without waiting for the live API to misbehave — mirroring the
// app's existing `?mock=missing` trust-contract demo. They only ever
// force *honest* states, never fabricate radar data.
const RADAR_OVERRIDES = new Set([
  "loading",
  "error",
  "empty",
  "nocoverage",
  "ok",
]);

export function readRadarOverride(
  search = typeof window !== "undefined" ? window.location?.search ?? "" : ""
) {
  try {
    const value = new URLSearchParams(search || "").get("radar");
    return value && RADAR_OVERRIDES.has(value) ? value : null;
  } catch {
    return null;
  }
}

function toFrame(entry, kind) {
  const time = entry?.time;
  const path = entry?.path;
  if (!Number.isFinite(time) || typeof path !== "string" || !path) {
    return null;
  }
  return { time, path, kind };
}

/**
 * Parses a raw weather-maps payload into { host, frames } or returns
 * null when the payload is unusable (not an object, or missing the tile
 * host). Frames are returned in chronological order with each tagged
 * 'past' or 'nowcast'. Malformed individual entries are dropped rather
 * than poisoning the whole list.
 */
export function parseWeatherMaps(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const host = typeof payload.host === "string" ? payload.host.trim() : "";
  if (!host) {
    return null;
  }

  const radar =
    payload.radar && typeof payload.radar === "object" ? payload.radar : {};
  const past = Array.isArray(radar.past) ? radar.past : [];
  const nowcast = Array.isArray(radar.nowcast) ? radar.nowcast : [];

  const frames = [
    ...past.map((entry) => toFrame(entry, RADAR_FRAME_KIND.PAST)),
    ...nowcast.map((entry) => toFrame(entry, RADAR_FRAME_KIND.NOWCAST)),
  ]
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  return { host, frames };
}

/**
 * Maps a raw weather-maps payload to the state the radar UI consumes.
 * This is the trust contract expressed as a pure function:
 *   - unusable payload (null / no host) -> { status: 'error', frames: [] }
 *   - usable but zero frames            -> { status: 'empty', frames: [] }
 *   - usable with frames                -> { status: 'ready', frames }
 * A network failure is mapped to the same 'error' state by the caller,
 * so the UI has a single honest "nothing to show" path.
 */
export function deriveRadarState(payload) {
  const parsed = parseWeatherMaps(payload);
  if (!parsed) {
    return { host: "", frames: [], status: RADAR_STATUS.ERROR };
  }
  if (parsed.frames.length === 0) {
    return { host: parsed.host, frames: [], status: RADAR_STATUS.EMPTY };
  }
  return {
    host: parsed.host,
    frames: parsed.frames,
    status: RADAR_STATUS.READY,
  };
}

async function fetchWeatherMaps({ signal } = {}) {
  // Cancellation and timeout are composed manually (see requestSignal.js):
  // AbortSignal.any is missing on Safari <17 / Firefox <115, and the previous
  // fallback dropped the timeout outright whenever a caller signal was passed.
  const request = createRequestSignal(signal, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(RAINVIEWER_WEATHER_MAPS_URL, {
      signal: request.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`RainViewer responded ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw request.normalizeError(error);
  } finally {
    request.release();
  }
}

/**
 * Fetches and resolves the current radar state. Never throws except on
 * an explicit abort (which the caller ignores) — every other failure is
 * folded into the honest 'error' state so callers have one degraded
 * path to render.
 */
export async function loadRadarState({ signal } = {}) {
  try {
    const payload = await fetchWeatherMaps({ signal });
    return deriveRadarState(payload);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return { host: "", frames: [], status: RADAR_STATUS.ERROR };
  }
}
