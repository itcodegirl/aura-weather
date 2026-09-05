// src/api/reverseGeocode.js
//
// Reverse geocoding for a resolved device-GPS fix. Open-Meteo's
// geocoding API is forward-only (name → coordinates), so this uses
// BigDataCloud's free, key-less, CORS-enabled `reverse-geocode-client`
// endpoint to turn raw coordinates into a human place name.
//
// This is *enrichment only*. The dashboard already renders immediately
// under the generic "Current location" label; any failure here
// (network, timeout, abort, non-OK status, unexpected shape, or simply
// no usable place name in the response) resolves to `null` so the
// generic label stays put. Nothing on the critical path depends on
// this provider being reachable.

import { parseCoordinates } from "../utils/weatherUnits.js";
import { createRequestSignal, isAbortError } from "./requestSignal.js";

const ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
// Shorter than the Open-Meteo budget on purpose: a place name is a
// nice-to-have, not worth holding a request open for ten seconds.
const TIMEOUT_MS = 6_000;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickPlaceName(data) {
  // Prefer the most locally meaningful name available, then fall back
  // outward. BigDataCloud's `city` is often empty for rural fixes, so
  // `locality` and the principal subdivision (state / province) backstop
  // it before we give up.
  return (
    cleanString(data?.city) ||
    cleanString(data?.locality) ||
    cleanString(data?.principalSubdivision) ||
    cleanString(data?.localityInfo?.administrative?.[0]?.name) ||
    ""
  );
}

export async function reverseGeocode(latitude, longitude, options = {}) {
  const coordinates = parseCoordinates(latitude, longitude);
  if (!coordinates) {
    return null;
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  // English on purpose, not for want of a preference. Open-Meteo's city
  // search (openMeteo.js) returns English names, so a GPS fix that came back
  // as "München" would sit in the saved-cities strip beside a searched
  // "Munich" as two differently named places. useLocation once computed the
  // browser's language list for a Nominatim adapter that has since been
  // deleted; the option was dead for months before anyone noticed (audit
  // O-06). Localise here only together with the search side.
  url.searchParams.set("localityLanguage", "en");

  // Cancellation and timeout are composed manually (see requestSignal.js):
  // AbortSignal.any is missing on Safari <17 / Firefox <115, and the previous
  // fallback dropped the timeout outright whenever a caller signal was passed.
  // release() covers the body read too, so the timeout still bounds a
  // response whose stream stalls after the headers arrive.
  const request = createRequestSignal(options.signal, TIMEOUT_MS);

  try {
    let response;
    try {
      response = await fetch(url, {
        signal: request.signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      const failure = request.normalizeError(error);
      if (isAbortError(failure)) {
        // Match the openMeteo adapters: an explicit abort propagates so
        // callers can stop a stale enrichment chain. Every other failure
        // — a timeout included — is swallowed below.
        throw failure;
      }
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return null;
    }

    const name = pickPlaceName(data);
    if (!name) {
      return null;
    }

    return {
      name,
      country: cleanString(data?.countryName),
    };
  } finally {
    request.release();
  }
}
