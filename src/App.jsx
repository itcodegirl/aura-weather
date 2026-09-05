import { useCallback, useEffect, useRef } from "react";
import "./App.css";
import { LOCATION_FALLBACK_NOTICE } from "./domain/location.js";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { usePwaInstallPrompt } from "./hooks/usePwaInstallPrompt";
import { useServiceWorkerUpdate } from "./hooks/useServiceWorkerUpdate";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useThemeColor } from "./hooks/useThemeColor";
import { useUrlLocationSync } from "./hooks/useUrlLocationSync";
import { useWeatherDashboardViewModel } from "./hooks/useWeatherDashboardViewModel";
import { usePersistentStorage } from "./hooks/useAppShellEffects";
import {
  AppShell,
  AppLoadingState,
  AppErrorState,
  AppHeader,
  StatusStack,
  WeatherDashboard,
} from "./components/layout";
import { GlobalUpdateIndicator } from "./components/ui";

const LOCATION_ONBOARDING_KEY = "aura-weather-location-onboarding-v1";

function deserializeLocationOnboardingPreference(value) {
  return value !== "dismissed";
}

function serializeLocationOnboardingPreference(value) {
  return value ? "visible" : "dismissed";
}

function App() {
  const {
    updateAvailable: serviceWorkerUpdateAvailable,
    offlineReady: serviceWorkerOfflineReady,
    isRefreshing: isServiceWorkerRefreshing,
    refreshUpdate: refreshServiceWorkerUpdate,
    dismissUpdate: dismissServiceWorkerUpdate,
    dismissOfflineReady: dismissServiceWorkerOfflineReady,
  } = useServiceWorkerUpdate();
  const {
    installPromptAvailable,
    isInstallPromptOpening,
    promptInstall,
    dismissInstallPrompt,
  } = usePwaInstallPrompt();
  const {
    weather,
    location,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
    clearSavedLocation,
    savedCities,
    recentCities,
    loadSavedCity,
    setStartupCity,
    restoreSavedCity,
    forgetSavedCity,
    moveSavedCity,
    syncConnected,
    syncState,
    createSyncAccount,
    disconnectSyncAccount,
    syncSavedCitiesNow,
    retryWeather,
    climateComparison,
    weatherDataUnit,
    isLocatingCurrent,
    isGeolocationSupported,
    hasPersistedLocation,
    startupLocation,
    showGlobalLoading,
    isBackgroundLoading,
    showGlobalError,
    showRefreshError,
    weatherInfo,
    trustMeta,
    background,
    isMissingMock,
    citySearchRef,
    prefersReducedData,
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
  useThemeColor(weatherInfo?.gradient);
  useUrlLocationSync(location);
  useDocumentTitle(location);
  // Best-effort: ask the browser to keep our storage (saved location +
  // cities) durable so an installed PWA reopens where the user left off
  // instead of being evicted back to the default location.
  usePersistentStorage();

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

  // When recovering from a global loader or error screen, focus the
  // main content so screen-reader users land in the weather dashboard
  // instead of being silently dropped on document.body. We only fire on
  // the transition out of those states, not on every dashboard render.
  const wasInterruptedRef = useRef(showGlobalLoading || showGlobalError);
  // ...but a cold start is *also* that transition: showGlobalLoading is
  // `loading && !weather`, which is true at mount for every first-time
  // visitor, so this used to move focus into <main> on an ordinary first
  // paint. The header — city search, My location, the unit toggle, the
  // saved-city chips — precedes <main> in the DOM, so forward Tab could
  // never reach any of it, and no focus ring had been shown to explain
  // where focus went. Restore focus only when the dashboard is coming
  // *back*; on the first paint leave it at the top of the document where
  // the browser put it, with the skip link first in tab order.
  const hasShownDashboardRef = useRef(false);
  useEffect(() => {
    const isInterrupted = showGlobalLoading || showGlobalError;
    if (!isInterrupted) {
      if (wasInterruptedRef.current && hasShownDashboardRef.current) {
        const main = document.getElementById("main-content");
        main?.focus?.({ preventScroll: true });
      }
      hasShownDashboardRef.current = true;
    }
    wasInterruptedRef.current = isInterrupted;
  }, [showGlobalLoading, showGlobalError]);

  /*
   * Held in a variable so the data-error screen can render the very same
   * header. AppHeader reads location, saved cities and settings but never
   * `weather`, so it is safe with no forecast loaded — and the error screen
   * is exactly where a reader needs the city search, since the failure may
   * be specific to the city they are on.
   */
  const header = (
    <AppHeader
      citySearchRef={citySearchRef}
      loadWeather={loadWeather}
      loadCurrentLocation={loadCurrentLocation}
      clearSavedLocation={clearSavedLocation}
      savedCities={savedCities}
      recentCities={recentCities}
      location={location}
      loadSavedCity={loadSavedCity}
      setStartupCity={setStartupCity}
      restoreSavedCity={restoreSavedCity}
      forgetSavedCity={forgetSavedCity}
      moveSavedCity={moveSavedCity}
      syncConnected={syncConnected}
      syncState={syncState}
      createSyncAccount={createSyncAccount}
      disconnectSyncAccount={disconnectSyncAccount}
      syncSavedCitiesNow={syncSavedCitiesNow}
      isLocatingCurrent={isLocatingCurrent}
      isGeolocationSupported={isGeolocationSupported}
      showClimateContext={showClimateContext}
      setShowClimateContext={setShowClimateContext}
      unit={unit}
      setUnit={setUnit}
      hasPersistedLocation={hasPersistedLocation}
      startupLocation={startupLocation}
    />
  );

  if (showGlobalLoading) {
    return <AppLoadingState />;
  }

  if (showGlobalError) {
    /*
     * Audit finding 25. This used to return the bare error card, replacing the
     * whole app — no header, no city search, no saved cities. showGlobalError
     * is `error && !hasWeatherData`, and "Reload weather" retries the same
     * city, so a reader whose city failed persistently had no way to reach a
     * different one. Rendering it inside the shell keeps every route out.
     */
    return (
      <AppShell
        background={background}
        conditionCode={weather?.current?.conditionCode}
        prefersReducedData={prefersReducedData}
      >
        {header}
        <AppErrorState error={error} onRetry={retryWeather} />
      </AppShell>
    );
  }

  return (
    <AppShell
      background={background}
      conditionCode={weather?.current?.conditionCode}
      prefersReducedData={prefersReducedData}
    >
      {header}

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
        error={error}
        cacheStatus={trustMeta?.cacheStatus}
        cacheCapturedAt={trustMeta?.cacheCapturedAt}
        onRetry={retryWeather}
        serviceWorkerUpdateAvailable={serviceWorkerUpdateAvailable}
        serviceWorkerOfflineReady={serviceWorkerOfflineReady}
        isServiceWorkerRefreshing={isServiceWorkerRefreshing}
        onRefreshServiceWorkerUpdate={refreshServiceWorkerUpdate}
        onDismissServiceWorkerUpdate={dismissServiceWorkerUpdate}
        onDismissServiceWorkerOfflineReady={dismissServiceWorkerOfflineReady}
        installPromptAvailable={installPromptAvailable}
        isInstallPromptOpening={isInstallPromptOpening}
        onInstallApp={promptInstall}
        onDismissInstallPrompt={dismissInstallPrompt}
        className="status-stack--runtime"
      />

      <GlobalUpdateIndicator
        trustMeta={trustMeta}
        onRefresh={retryWeather}
        isRefreshing={isBackgroundLoading}
      />

      <WeatherDashboard
        weather={weather}
        location={location}
        unit={unit}
        weatherDataUnit={weatherDataUnit}
        climateComparison={climateComparison}
        isBackgroundLoading={isBackgroundLoading}
        weatherInfo={weatherInfo}
        trustMeta={trustMeta}
        prefersReducedData={prefersReducedData}
        isMissingMock={isMissingMock}
      />
    </AppShell>
  );
}

export default App;
