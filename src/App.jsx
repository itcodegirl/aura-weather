import { useCallback, useEffect } from "react";
import "./App.css";
import { LOCATION_FALLBACK_NOTICE } from "./hooks/useLocation";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useWeatherDashboardViewModel } from "./hooks/useWeatherDashboardViewModel";
import {
  AppShell,
  AppLoadingState,
  AppErrorState,
  AppHeader,
  StatusStack,
  WeatherDashboard,
} from "./components/layout";

const LOCATION_ONBOARDING_KEY = "aura-weather-location-onboarding-v1";

function deserializeLocationOnboardingPreference(value) {
  return value !== "dismissed";
}

function serializeLocationOnboardingPreference(value) {
  return value ? "visible" : "dismissed";
}

function App() {
  const {
    weather,
    location,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
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
    retryWeather,
    climateComparison,
    weatherDataUnit,
    isLocatingCurrent,
    isGeolocationSupported,
    showGlobalLoading,
    isBackgroundLoading,
    showGlobalError,
    showRefreshError,
    weatherInfo,
    trustMeta,
    background,
    citySearchRef,
    unit,
    setUnit,
    showClimateContext,
    setShowClimateContext,
  } = useWeatherDashboardViewModel();
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useLocalStorageState(
    LOCATION_ONBOARDING_KEY,
    true,
    {
      deserialize: deserializeLocationOnboardingPreference,
      serialize: serializeLocationOnboardingPreference,
    }
  );
  const isFallbackLocation = locationNotice === LOCATION_FALLBACK_NOTICE;
  const shouldShowPermissionOnboarding = isFallbackLocation && showPermissionOnboarding;
  const showLocationSetupPrompt = isFallbackLocation && !shouldShowPermissionOnboarding;

  useEffect(() => {
    if (!isFallbackLocation && showPermissionOnboarding) {
      setShowPermissionOnboarding(false);
    }
  }, [isFallbackLocation, setShowPermissionOnboarding, showPermissionOnboarding]);

  const handleFocusCitySearch = useCallback(() => {
    citySearchRef.current?.focus?.();
  }, [citySearchRef]);
  const handleDismissPermissionOnboarding = useCallback(() => {
    setShowPermissionOnboarding(false);
  }, [setShowPermissionOnboarding]);

  if (showGlobalLoading) {
    return <AppLoadingState />;
  }

  if (showGlobalError) {
    return <AppErrorState error={error} onRetry={retryWeather} />;
  }

  return (
    <AppShell background={background}>
      <AppHeader
        citySearchRef={citySearchRef}
        loadWeather={loadWeather}
        loadCurrentLocation={loadCurrentLocation}
        clearSavedLocation={clearSavedLocation}
        savedCities={savedCities}
        location={location}
        loadSavedCity={loadSavedCity}
        forgetSavedCity={forgetSavedCity}
        syncConnected={syncConnected}
        syncAccount={syncAccount}
        syncState={syncState}
        createSyncAccount={createSyncAccount}
        connectSyncAccount={connectSyncAccount}
        disconnectSyncAccount={disconnectSyncAccount}
        syncSavedCitiesNow={syncSavedCitiesNow}
        isLocatingCurrent={isLocatingCurrent}
        isGeolocationSupported={isGeolocationSupported}
        showClimateContext={showClimateContext}
        setShowClimateContext={setShowClimateContext}
        unit={unit}
        setUnit={setUnit}
      />

      <StatusStack
        locationNotice={locationNotice}
        showLocationSetupPrompt={showLocationSetupPrompt}
        showPermissionOnboarding={shouldShowPermissionOnboarding}
        onUseCurrentLocation={loadCurrentLocation}
        onFocusCitySearch={handleFocusCitySearch}
        onDismissPermissionOnboarding={handleDismissPermissionOnboarding}
        isLocatingCurrent={isLocatingCurrent}
        isGeolocationSupported={isGeolocationSupported}
        isBackgroundLoading={isBackgroundLoading}
        showRefreshError={showRefreshError}
        onRetry={retryWeather}
        showSetupPrompts={false}
        className="status-stack--runtime"
      />

      <WeatherDashboard
        weather={weather}
        location={location}
        unit={unit}
        weatherDataUnit={weatherDataUnit}
        climateComparison={climateComparison}
        showClimateContext={showClimateContext}
        isBackgroundLoading={isBackgroundLoading}
        weatherInfo={weatherInfo}
        trustMeta={trustMeta}
      />

      <StatusStack
        locationNotice={locationNotice}
        showLocationSetupPrompt={showLocationSetupPrompt}
        showPermissionOnboarding={shouldShowPermissionOnboarding}
        onUseCurrentLocation={loadCurrentLocation}
        onFocusCitySearch={handleFocusCitySearch}
        onDismissPermissionOnboarding={handleDismissPermissionOnboarding}
        isLocatingCurrent={isLocatingCurrent}
        isGeolocationSupported={isGeolocationSupported}
        isBackgroundLoading={isBackgroundLoading}
        showRefreshError={showRefreshError}
        onRetry={retryWeather}
        showRuntimeStatus={false}
        className="status-stack--setup"
      />
    </AppShell>
  );
}

export default App;
