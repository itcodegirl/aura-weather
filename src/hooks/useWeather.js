import { useState, useCallback, useEffect, useRef } from "react";
import {
  CURRENT_LOCATION_NAME,
  CURRENT_LOCATION_NOTICE,
  useLocation,
  persistLocation,
  clearPersistedLocation,
  getPersistedLocation,
  getRecentCities,
  getSavedCities,
  upsertSavedCity,
  upsertRecentCity,
  removeSavedCity,
  moveSavedCity as moveSavedCityInStorage,
} from "./useLocation";
import { useSavedLocationsSync } from "./useSavedLocationsSync";
import { useWeatherData } from "./useWeatherData";
import { parseLocationFromUrl } from "./useUrlLocationSync";
import {
  hasMatchingCoordinates,
  toLocationPayload,
  resolveInitialLocationState,
} from "./locationHelpers";

function buildCurrentLocationNotice(placeName) {
  const trimmedPlaceName =
    typeof placeName === "string" ? placeName.trim() : "";
  if (!trimmedPlaceName || trimmedPlaceName === CURRENT_LOCATION_NAME) {
    return CURRENT_LOCATION_NOTICE;
  }

  return `Showing your device location near ${trimmedPlaceName}`;
}

function getInitialLocationState() {
  // A shared/bookmarked ?lat&lon deep link takes precedence over the
  // persisted startup city so opening someone else's forecast link
  // actually lands on that place. resolveInitialLocationState keeps the
  // precedence (and the "don't clobber my startup city" rule) pure and
  // unit-tested; the write-path in useUrlLocationSync mirrors the
  // resolved location straight back, so the seed and URL stay in sync.
  return resolveInitialLocationState({
    urlLocation: parseLocationFromUrl(),
    persistedLocation: getPersistedLocation(),
  });
}

export function useWeather(options = {}) {
  const {
    climateEnabled = true,
    weatherEnabled = true,
    backgroundRefreshEnabled = true,
  } = options;
  const [initialLocationState] = useState(() => getInitialLocationState());
  const [location, setLocation] = useState(initialLocationState.location);
  const [startupLocation, setStartupLocation] = useState(
    initialLocationState.startupLocation
  );
  const [locationNotice, setLocationNotice] = useState(initialLocationState.notice);
  const [hasPersistedLocation, setHasPersistedLocation] = useState(
    initialLocationState.hasPersistedLocation
  );
  const [savedCities, setSavedCities] = useState(() => getSavedCities());
  const [recentCities, setRecentCities] = useState(() => getRecentCities());
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
    setStartupLocation(nextLocation);
    setHasPersistedLocation(true);
  }, []);

  const applyLocation = useCallback(
    (nextLocation, notice = null, options = {}) => {
      const {
        saveCity = true,
        persistLocation: shouldPersistLocation = true,
        saveRecent = saveCity,
      } = options;
      const currentLocation = locationRef.current;
      const hasSameLocation =
        currentLocation &&
        currentLocation.lat === nextLocation.lat &&
        currentLocation.lon === nextLocation.lon &&
        currentLocation.name === nextLocation.name &&
        currentLocation.country === nextLocation.country;
      const hasSameNotice = locationNoticeRef.current === notice;

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

      if (saveRecent) {
        const updatedRecentCities = upsertRecentCity(
          nextLocation.lat,
          nextLocation.lon,
          nextLocation.name,
          nextLocation.country
        );
        setRecentCities(updatedRecentCities);
      }

      if (hasSameLocation && hasSameNotice) {
        return;
      }

      if (!hasSameLocation) {
        setLocation(nextLocation);
        locationRef.current = nextLocation;
      }

      if (!hasSameNotice) {
        setLocationNotice(notice);
        locationNoticeRef.current = notice;
      }
    },
    [persistLocationPayload]
  );

  const handleLocationResolved = useCallback(
    (lat, lon, name, country, notice = null, metadata = null) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }

      const nextNotice =
        notice === CURRENT_LOCATION_NOTICE
          ? buildCurrentLocationNotice(nextLocation.name)
          : notice;
      const isUserDrivenSelection = notice === null;
      applyLocation(nextLocation, nextNotice, {
        saveCity: metadata?.saveCity ?? isUserDrivenSelection,
        persistLocation:
          metadata?.persistLocation ?? isUserDrivenSelection,
        saveRecent: metadata?.trackRecent ?? isUserDrivenSelection,
      });
    },
    [applyLocation]
  );

  const {
    isLocatingCurrent,
    isGeolocationSupported,
    loadCurrentLocation,
    cancelCurrentLocationLookup,
  } = useLocation(handleLocationResolved);

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
    enabled: weatherEnabled,
    backgroundRefreshEnabled,
  });

  // Shared entrypoint used by the search bar (loadWeather, called with
  // positional args). Search/manual picks remain intentional enough to
  // refresh the startup city preference automatically.
  const applyResolvedSearchLocation = useCallback(
    (lat, lon, name, country) => {
      const nextLocation = toLocationPayload(lat, lon, name, country);
      if (!nextLocation) {
        return;
      }
      cancelCurrentLocationLookup();
      applyLocation(nextLocation, null, {
        saveCity: true,
        persistLocation: true,
        saveRecent: true,
      });
    },
    [applyLocation, cancelCurrentLocationLookup]
  );

  const loadWeather = useCallback(
    (lat, lon, name, country) =>
      applyResolvedSearchLocation(lat, lon, name, country),
    [applyResolvedSearchLocation]
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

      cancelCurrentLocationLookup();
      applyLocation(nextLocation, null, {
        saveCity: true,
        persistLocation: false,
        saveRecent: true,
      });
    },
    [applyLocation, cancelCurrentLocationLookup]
  );

  const setStartupCity = useCallback((city) => {
    const nextLocation = toLocationPayload(
      city?.lat,
      city?.lon,
      city?.name,
      city?.country
    );
    if (!nextLocation) {
      return;
    }

    persistLocationPayload(nextLocation);
    const isCurrentCity =
      hasMatchingCoordinates(locationRef.current, nextLocation);
    const startupNotice = isCurrentCity
      ? `${nextLocation.name} is now your startup city.`
      : `${nextLocation.name} will open when Aura starts.`;
    setLocationNotice(startupNotice);
    locationNoticeRef.current = startupNotice;
  }, [persistLocationPayload]);

  const restoreSavedCity = useCallback((city, options = {}) => {
    const nextLocation = toLocationPayload(
      city?.lat,
      city?.lon,
      city?.name,
      city?.country
    );
    if (!nextLocation) {
      return;
    }

    const updatedSavedCities = upsertSavedCity(
      nextLocation.lat,
      nextLocation.lon,
      nextLocation.name,
      nextLocation.country
    );
    setSavedCities(updatedSavedCities);

    if (options?.makeStartup) {
      persistLocationPayload(nextLocation);
      const restoredNotice = `${nextLocation.name} is your startup city again.`;
      setLocationNotice(restoredNotice);
      locationNoticeRef.current = restoredNotice;
    }
  }, [persistLocationPayload]);

  const forgetSavedCity = useCallback((city) => {
    const updatedSavedCities = removeSavedCity(city?.lat, city?.lon);
    setSavedCities(updatedSavedCities);

    const persistedLocation = getPersistedLocation();
    if (!hasMatchingCoordinates(persistedLocation, city)) {
      return;
    }

    clearPersistedLocation();
    setStartupLocation(null);
    setHasPersistedLocation(false);
    const removedSavedLocationNotice =
      "Saved startup location removed. Aura will open to Chicago next time.";
    setLocationNotice(removedSavedLocationNotice);
    locationNoticeRef.current = removedSavedLocationNotice;
  }, []);

  // Reorders the persisted list; the saved-locations sync effect picks
  // the new order up like any other savedCities change and pushes it.
  const moveSavedCity = useCallback((city, offset) => {
    const updatedSavedCities = moveSavedCityInStorage(
      city?.lat,
      city?.lon,
      offset
    );
    setSavedCities(updatedSavedCities);
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
    setStartupLocation(null);
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
    startupLocation,
    clearSavedLocation,
    savedCities,
    recentCities,
    loadSavedCity,
    setStartupCity,
    restoreSavedCity,
    forgetSavedCity,
    moveSavedCity,
    syncConnected,
    syncAccount,
    syncState,
    createSyncAccount,
    connectSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
  };
}
