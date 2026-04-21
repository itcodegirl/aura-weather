// src/hooks/useWeather.js

import { useState, useEffect, useCallback, useRef } from "react";
import {
  normalizeTemperatureUnit,
  parseCoordinates,
} from "../utils/weatherUnits";
import {
  useLocation,
  DEFAULT_LOCATION,
  LOCATION_FALLBACK_NOTICE,
  SAVED_LOCATION_NOTICE,
  LOCATION_FALLBACK_DELAY_MS,
  normalizeLocationName,
} from "./useLocation";
import { useWeatherData } from "./useWeatherData";

function scheduleTask(callback) {
  if (typeof callback !== "function") return;
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  Promise.resolve()
    .then(callback)
    .catch(() => {
      // Keep async scheduling failures from leaking as unhandled rejections.
    });
}

function toLocationPayload(lat, lon, name = "", country = "") {
  const coordinates = parseCoordinates(lat, lon);
  if (!coordinates) {
    return null;
  }

  return {
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    name: normalizeLocationName(name, ""),
    country: normalizeLocationName(country, ""),
  };
}

export function useWeather(unit = "F", options = {}) {
  const { climateEnabled = true } = options;
  const [locationNotice, setLocationNotice] = useState(null);
  const {
    location,
    setLocation,
    isLocatingCurrent,
    getPersistedLocation,
    persistLocation,
    requestCurrentPositionWithFallback,
  } = useLocation(unit);
  const activeUnitRef = useRef(normalizeTemperatureUnit(unit));

  useEffect(() => {
    activeUnitRef.current = normalizeTemperatureUnit(unit);
  }, [unit]);

  const applyLocation = useCallback(
    (nextLocation, notice = null) => {
      if (!nextLocation || typeof nextLocation !== "object") {
        return false;
      }

      const normalizedLocation = toLocationPayload(
        nextLocation.lat,
        nextLocation.lon,
        nextLocation.name,
        nextLocation.country
      );
      if (!normalizedLocation) {
        return false;
      }

      setLocation(normalizedLocation);
      setLocationNotice(notice);
      return true;
    },
    [setLocation]
  );

  const handleLocationResolved = useCallback(
    (resolvedLocation) => {
      if (!resolvedLocation || typeof resolvedLocation !== "object") {
        return;
      }

      const normalizedLocation = {
        lat: Number(resolvedLocation.lat),
        lon: Number(resolvedLocation.lon),
        name: normalizeLocationName(resolvedLocation.name, DEFAULT_LOCATION.name),
        country: normalizeLocationName(
          resolvedLocation.country,
          DEFAULT_LOCATION.country
        ),
      };
      setLocation(normalizedLocation);
      persistLocation(
        normalizedLocation.lat,
        normalizedLocation.lon,
        normalizedLocation.name,
        normalizedLocation.country
      );
    },
    [setLocation, persistLocation]
  );

  const {
    weather,
    weatherDataUnit,
    weatherWindSpeedUnit,
    loading,
    error,
    climateComparison,
    retryWeather,
  } = useWeatherData(unit, {
    climateEnabled,
    location,
    onLocationResolved: handleLocationResolved,
  });

  const loadDefaultLocation = useCallback(
    (requestUnit, fallbackNotice = LOCATION_FALLBACK_NOTICE) => {
      const normalizedRequestUnit = normalizeTemperatureUnit(
        requestUnit ?? activeUnitRef.current
      );
      applyLocation(
        {
          ...DEFAULT_LOCATION,
          name: DEFAULT_LOCATION.name,
          country: DEFAULT_LOCATION.country,
        },
        fallbackNotice
      );
      activeUnitRef.current = normalizedRequestUnit;
    },
    [applyLocation]
  );

  const loadWeather = useCallback(
    (lat, lon, name, country) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      applyLocation(nextLocation, null);
    },
    [applyLocation]
  );

  const loadCurrentLocation = useCallback(
    (loadOptions = {}) => {
      const normalizedOptions =
        loadOptions && typeof loadOptions === "object" ? loadOptions : {};
      const requestUnit = normalizeTemperatureUnit(
        normalizedOptions.unit ?? activeUnitRef.current
      );
      const fallbackNotice =
        normalizedOptions.fallbackNotice ?? LOCATION_FALLBACK_NOTICE;
      const applyFallback = () => loadDefaultLocation(requestUnit, fallbackNotice);

      requestCurrentPositionWithFallback({
        requestUnit,
        fallbackNotice,
        trackCurrentLookup: true,
        onSuccess: (position) => {
          applyLocation(
            {
              lat: position?.latitude,
              lon: position?.longitude,
            },
            null
          );
        },
        onFallback: () => {
          applyFallback();
        },
      });
    },
    [requestCurrentPositionWithFallback, loadDefaultLocation, applyLocation]
  );

  useEffect(() => {
    if (location !== null) {
      return;
    }

    const persisted = getPersistedLocation();
    const requestUnit = normalizeTemperatureUnit(activeUnitRef.current);
    if (persisted) {
      scheduleTask(() => {
        applyLocation(
          {
            lat: persisted.lat,
            lon: persisted.lon,
            name: normalizeLocationName(persisted.name, DEFAULT_LOCATION.name),
            country: normalizeLocationName(
              persisted.country,
              DEFAULT_LOCATION.country
            ),
          },
          SAVED_LOCATION_NOTICE
        );
      });
      return undefined;
    }

    const fallbackTimer = setTimeout(() => {
      loadDefaultLocation(requestUnit, LOCATION_FALLBACK_NOTICE);
    }, LOCATION_FALLBACK_DELAY_MS);

    scheduleTask(() => {
      requestCurrentPositionWithFallback({
        requestUnit,
        fallbackNotice: LOCATION_FALLBACK_NOTICE,
        onSuccess: ({ latitude, longitude }) => {
          clearTimeout(fallbackTimer);
          applyLocation({ lat: latitude, lon: longitude }, null);
        },
        onFallback: () => {
          clearTimeout(fallbackTimer);
          loadDefaultLocation(requestUnit, LOCATION_FALLBACK_NOTICE);
        },
      });
    });

    return () => {
      clearTimeout(fallbackTimer);
    };
  }, [
    location,
    getPersistedLocation,
    requestCurrentPositionWithFallback,
    loadDefaultLocation,
    applyLocation,
  ]);

  return {
    weather,
    weatherDataUnit,
    weatherWindSpeedUnit,
    location,
    loading,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
    retryWeather,
    climateComparison,
    isLocatingCurrent,
  };
}
