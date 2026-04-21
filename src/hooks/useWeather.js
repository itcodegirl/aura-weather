import { useState, useCallback } from "react";
import { parseCoordinates } from "../utils/weatherUnits";
import {
  useLocation,
  persistLocation,
  normalizeLocationName,
} from "./useLocation";
import { useWeatherData } from "./useWeatherData";

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
  const [location, setLocation] = useState(null);
  const [locationNotice, setLocationNotice] = useState(null);

  const persistLocationPayload = useCallback((nextLocation) => {
    persistLocation(
      nextLocation.lat,
      nextLocation.lon,
      nextLocation.name,
      nextLocation.country
    );
  }, []);

  const applyLocation = useCallback(
    (nextLocation, notice = null) => {
      setLocation((current) => {
        const hasSameLocation =
          current &&
          current.lat === nextLocation.lat &&
          current.lon === nextLocation.lon &&
          current.name === nextLocation.name &&
          current.country === nextLocation.country;

        if (hasSameLocation) {
          return current;
        }

        return nextLocation;
      });

      setLocationNotice(notice);
      persistLocationPayload(nextLocation);
    },
    [persistLocationPayload]
  );

  const handleLocationResolved = useCallback(
    (lat, lon, name, country, notice = null) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      applyLocation(nextLocation, notice);
    },
    [applyLocation]
  );

  const { isLocatingCurrent, loadCurrentLocation } = useLocation(
    handleLocationResolved
  );

  const {
    weather,
    loading,
    error,
    climateComparison,
    retryWeather,
  } = useWeatherData(location, unit, {
    climateEnabled,
  });

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

  return {
    weather,
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
