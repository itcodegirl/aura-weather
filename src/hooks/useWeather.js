import { useState, useCallback, useEffect, useRef } from "react";
import {
  DEFAULT_LOCATION,
  useLocation,
  persistLocation,
  clearPersistedLocation,
  getPersistedLocation,
  getSavedCities,
  upsertSavedCity,
  removeSavedCity,
  LOCATION_FALLBACK_NOTICE,
  SAVED_LOCATION_NOTICE,
} from "./useLocation";
import { useSavedLocationsSync } from "./useSavedLocationsSync";
import { useWeatherData } from "./useWeatherData";
import {
  hasMatchingCoordinates,
  toLocationPayload,
} from "./locationHelpers";

function getInitialLocationState() {
  const persistedLocation = getPersistedLocation();
  if (persistedLocation) {
    return {
      location: persistedLocation,
      notice: SAVED_LOCATION_NOTICE,
      hasPersistedLocation: true,
    };
  }

  return {
    location: DEFAULT_LOCATION,
    notice: LOCATION_FALLBACK_NOTICE,
    hasPersistedLocation: false,
  };
}

export function useWeather(options = {}) {
  const { climateEnabled = true } = options;
  const [initialLocationState] = useState(() => getInitialLocationState());
  const [location, setLocation] = useState(initialLocationState.location);
  const [locationNotice, setLocationNotice] = useState(initialLocationState.notice);
  const [hasPersistedLocation, setHasPersistedLocation] = useState(
    initialLocationState.hasPersistedLocation
  );
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
    setHasPersistedLocation(true);
  }, []);

  const applyLocation = useCallback(
    (nextLocation, notice = null, options = {}) => {
      const { saveCity = true, persistLocation: shouldPersistLocation = true } = options;
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
        if (shouldPersistLocation) {
          persistLocationPayload(nextLocation);
        }

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
      applyLocation(nextLocation, notice, {
        saveCity: shouldSaveCity,
        persistLocation: shouldSaveCity,
      });
    },
    [applyLocation]
  );

  const { isLocatingCurrent, isGeolocationSupported, loadCurrentLocation } = useLocation(
    handleLocationResolved
  );

  const {
    weather,
    weatherDataUnit,
    loading,
    error,
    climateComparison,
    retryWeather,
    trustMeta,
  } = useWeatherData(location, {
    climateEnabled,
  });

  // Shared entrypoint used by both the search bar (loadWeather, called
  // with positional args) and the saved-cities strip (loadSavedCity,
  // called with a city object). Both flows resolve to the same
  // applyLocation invocation; keeping a single body makes it impossible
  // for the two to drift.
  const applyResolvedLocation = useCallback(
    (lat, lon, name, country) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      applyLocation(nextLocation, null, { saveCity: true });
    },
    [applyLocation]
  );

  const loadWeather = useCallback(
    (lat, lon, name, country) => applyResolvedLocation(lat, lon, name, country),
    [applyResolvedLocation]
  );

  const loadSavedCity = useCallback(
    (city) =>
      applyResolvedLocation(city?.lat, city?.lon, city?.name, city?.country),
    [applyResolvedLocation]
  );

  const forgetSavedCity = useCallback((city) => {
    const updatedSavedCities = removeSavedCity(city?.lat, city?.lon);
    setSavedCities(updatedSavedCities);

    const persistedLocation = getPersistedLocation();
    if (!hasMatchingCoordinates(persistedLocation, city)) {
      return;
    }

    clearPersistedLocation();
    setHasPersistedLocation(false);
    const removedSavedLocationNotice =
      "Saved startup location removed. Aura will open to Chicago next time.";
    setLocationNotice(removedSavedLocationNotice);
    locationNoticeRef.current = removedSavedLocationNotice;
  }, []);
  const {
    syncConnected,
    syncAccount,
    syncState,
    createSyncAccount,
    connectSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
  } = useSavedLocationsSync(savedCities, setSavedCities);

  const clearSavedLocation = useCallback(() => {
    clearPersistedLocation();
    setHasPersistedLocation(false);
    setLocationNotice("Saved location removed for future sessions.");
    locationNoticeRef.current = "Saved location removed for future sessions.";
  }, []);

  return {
    weather,
    weatherDataUnit,
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
    isGeolocationSupported,
    hasPersistedLocation,
    clearSavedLocation,
    savedCities,
    loadSavedCity,
    forgetSavedCity,
    syncConnected,
    syncAccount,
    syncState,
    createSyncAccount,
    connectSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
  };
}
