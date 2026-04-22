import { useState, useCallback, useEffect, useRef } from "react";
import { parseCoordinates } from "../utils/weatherUnits";
import {
  useLocation,
  persistLocation,
  clearPersistedLocation,
  getSavedCities,
  upsertSavedCity,
  removeSavedCity,
  normalizeLocationName,
  LOCATION_FALLBACK_NOTICE,
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
  const [savedCities, setSavedCities] = useState(() => getSavedCities());
  const locationRef = useRef(location);
  const locationNoticeRef = useRef(locationNotice);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    locationNoticeRef.current = locationNotice;
  }, [locationNotice]);

  const persistLocationPayload = useCallback((nextLocation) => {
    persistLocation(
      nextLocation.lat,
      nextLocation.lon,
      nextLocation.name,
      nextLocation.country
    );
  }, []);

  const applyLocation = useCallback(
    (nextLocation, notice = null, options = {}) => {
      const { saveCity = true } = options;
      const currentLocation = locationRef.current;
      const hasSameLocation =
        currentLocation &&
        currentLocation.lat === nextLocation.lat &&
        currentLocation.lon === nextLocation.lon &&
        currentLocation.name === nextLocation.name &&
        currentLocation.country === nextLocation.country;
      const hasSameNotice = locationNoticeRef.current === notice;

      if (hasSameLocation && hasSameNotice) {
        return;
      }

      if (!hasSameLocation) {
        setLocation(nextLocation);
        locationRef.current = nextLocation;
        persistLocationPayload(nextLocation);

        if (saveCity) {
          const updatedSavedCities = upsertSavedCity(
            nextLocation.lat,
            nextLocation.lon,
            nextLocation.name,
            nextLocation.country
          );
          setSavedCities(updatedSavedCities);
        }
      }

      if (!hasSameNotice) {
        setLocationNotice(notice);
        locationNoticeRef.current = notice;
      }
    },
    [persistLocationPayload]
  );

  const handleLocationResolved = useCallback(
    (lat, lon, name, country, notice = null) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      const shouldSaveCity = notice !== LOCATION_FALLBACK_NOTICE;
      applyLocation(nextLocation, notice, { saveCity: shouldSaveCity });
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
    trustMeta,
  } = useWeatherData(location, unit, {
    climateEnabled,
  });

  const loadWeather = useCallback(
    (lat, lon, name, country) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      applyLocation(nextLocation, null, { saveCity: true });
    },
    [applyLocation]
  );

  const loadSavedCity = useCallback(
    (city) => {
      const nextLocation = toLocationPayload(
        city?.lat,
        city?.lon,
        city?.name,
        city?.country
      );
      if (!nextLocation) {
        return;
      }

      applyLocation(nextLocation, null, { saveCity: true });
    },
    [applyLocation]
  );

  const forgetSavedCity = useCallback((city) => {
    const updatedSavedCities = removeSavedCity(city?.lat, city?.lon);
    setSavedCities(updatedSavedCities);
  }, []);

  const clearSavedLocation = useCallback(() => {
    clearPersistedLocation();
    setLocationNotice("Saved location removed for future sessions.");
    locationNoticeRef.current = "Saved location removed for future sessions.";
  }, []);

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
    trustMeta,
    isLocatingCurrent,
    clearSavedLocation,
    savedCities,
    loadSavedCity,
    forgetSavedCity,
  };
}
