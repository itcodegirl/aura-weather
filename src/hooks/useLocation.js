import { useState, useEffect, useCallback, useRef } from "react";
import { parseCoordinates } from "../utils/weatherUnits.js";

export const DEFAULT_LOCATION = {
  lat: 41.8781,
  lon: -87.6298,
  name: "Chicago",
  country: "United States",
};
export const LOCATION_FALLBACK_NOTICE =
  "Location not available \u2014 showing Chicago";
export const SAVED_LOCATION_NOTICE = "Showing your previously selected location";
const LAST_LOCATION_KEY = "aura-weather-last-location";
const LAST_LOCATION_TTL_DAYS = 30;
const GEOLOCATION_TIMEOUT_MS = 5000;
export const LOCATION_FALLBACK_DELAY_MS = GEOLOCATION_TIMEOUT_MS + 1000;

export function normalizeLocationName(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function hasValidLastLocationTimestamp(saved) {
  if (!saved?.updatedAt) {
    return false;
  }

  const savedTime = Date.parse(saved.updatedAt);
  if (!Number.isFinite(savedTime)) {
    return false;
  }

  const ageMs = Date.now() - savedTime;
  const maxAgeMs = LAST_LOCATION_TTL_DAYS * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

function hasGeolocationSupport() {
  return (
    typeof navigator !== "undefined" &&
    navigator &&
    typeof navigator.geolocation !== "undefined" &&
    navigator.geolocation !== null &&
    typeof navigator.geolocation.getCurrentPosition === "function"
  );
}

export function getPersistedLocation() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const saved = window.localStorage.getItem(LAST_LOCATION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!hasValidLastLocationTimestamp(parsed)) {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
      return null;
    }

    const coordinates = parseCoordinates(parsed?.lat, parsed?.lon);
    if (!coordinates) {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
      return null;
    }

    return {
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      name: normalizeLocationName(parsed?.name, DEFAULT_LOCATION.name),
      country: normalizeLocationName(parsed?.country, DEFAULT_LOCATION.country),
    };
  } catch {
    try {
      window.localStorage.removeItem(LAST_LOCATION_KEY);
    } catch {
      // localStorage may be unavailable or inaccessible in restricted contexts.
    }
    return null;
  }
}

export function persistLocation(lat, lon, name, country) {
  const coordinates = parseCoordinates(lat, lon);
  if (!coordinates) return;

  const normalizedName = normalizeLocationName(name, DEFAULT_LOCATION.name);
  const normalizedCountry = normalizeLocationName(country, DEFAULT_LOCATION.country);

  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({
        lat: coordinates.latitude,
        lon: coordinates.longitude,
        name: normalizedName,
        country: normalizedCountry,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

export function clearPersistedLocation() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(LAST_LOCATION_KEY);
  } catch {
    // localStorage may be unavailable in restricted contexts.
  }
}

function notifyResolvedLocation(callback, lat, lon, name, country, notice) {
  if (typeof callback !== "function") return;

  const coordinates = parseCoordinates(lat, lon);
  if (!coordinates) return;

  callback(
    coordinates.latitude,
    coordinates.longitude,
    normalizeLocationName(name, DEFAULT_LOCATION.name),
    normalizeLocationName(country, DEFAULT_LOCATION.country),
    notice
  );
}

export function useLocation(onResolved) {
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);
  const isMountedRef = useRef(false);
  const fallbackTimerRef = useRef(null);
  const activeRequestRef = useRef(0);
  const onResolvedRef = useRef(
    typeof onResolved === "function" ? onResolved : null
  );

  const clearFallbackTimer = useCallback(() => {
    if (!fallbackTimerRef.current) {
      return;
    }

    clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearFallbackTimer();
    };
  }, [clearFallbackTimer]);

  useEffect(() => {
    onResolvedRef.current =
      typeof onResolved === "function" ? onResolved : null;
  }, [onResolved]);

  const requestCurrentPositionWithFallback = useCallback(
    ({ fallbackNotice = LOCATION_FALLBACK_NOTICE, trackCurrentLookup = false } = {}) => {
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      const resolveCallback = onResolvedRef.current;

      const markLookupComplete = () => {
        if (requestId !== activeRequestRef.current || !isMountedRef.current) {
          return;
        }

        if (trackCurrentLookup) {
          setIsLocatingCurrent(false);
        }
      };

      const fallback = () => {
        clearFallbackTimer();
        if (requestId !== activeRequestRef.current || !isMountedRef.current) {
          return;
        }

        markLookupComplete();
        notifyResolvedLocation(
          resolveCallback,
          DEFAULT_LOCATION.lat,
          DEFAULT_LOCATION.lon,
          DEFAULT_LOCATION.name,
          DEFAULT_LOCATION.country,
          fallbackNotice
        );
      };

      clearFallbackTimer();
      fallbackTimerRef.current = setTimeout(() => {
        if (requestId === activeRequestRef.current) {
          fallback();
        }
      }, LOCATION_FALLBACK_DELAY_MS);

      if (!hasGeolocationSupport()) {
        fallback();
        return;
      }

      if (trackCurrentLookup) {
        setIsLocatingCurrent(true);
      }

      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (requestId !== activeRequestRef.current || !isMountedRef.current) {
              return;
            }

            clearFallbackTimer();
            markLookupComplete();

            notifyResolvedLocation(
              resolveCallback,
              position?.coords?.latitude,
              position?.coords?.longitude,
              "",
              "",
              null
            );
          },
          () => {
            if (requestId !== activeRequestRef.current || !isMountedRef.current) {
              return;
            }

            fallback();
          },
          { timeout: GEOLOCATION_TIMEOUT_MS }
        );
      } catch {
        if (requestId === activeRequestRef.current && isMountedRef.current) {
          fallback();
        }
      }
    },
    [clearFallbackTimer]
  );

  const loadCurrentLocation = useCallback(
    ({ fallbackNotice = LOCATION_FALLBACK_NOTICE } = {}) => {
      requestCurrentPositionWithFallback({
        fallbackNotice,
        trackCurrentLookup: true,
      });
    },
    [requestCurrentPositionWithFallback]
  );

  useEffect(() => {
    const persistedLocation = getPersistedLocation();
    if (persistedLocation) {
      notifyResolvedLocation(
        onResolvedRef.current,
        persistedLocation.lat,
        persistedLocation.lon,
        persistedLocation.name,
        persistedLocation.country,
        SAVED_LOCATION_NOTICE
      );
      return undefined;
    }

    Promise.resolve().then(() => {
      requestCurrentPositionWithFallback({
        fallbackNotice: LOCATION_FALLBACK_NOTICE,
        trackCurrentLookup: false,
      });
    });

    return () => {
      clearFallbackTimer();
      activeRequestRef.current += 1;
    };
  }, [requestCurrentPositionWithFallback, clearFallbackTimer]);

  return {
    isLocatingCurrent,
    loadCurrentLocation,
  };
}
