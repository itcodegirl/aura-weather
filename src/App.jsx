import "./App.css";
import { useWeatherDashboardViewModel } from "./hooks/useWeatherDashboardViewModel";
import {
  AppShell,
  AppLoadingState,
  AppErrorState,
  AppHeader,
  StatusStack,
  WeatherDashboard,
} from "./components/layout";

function App() {
  const {
    weather,
    location,
    error,
    locationNotice,
    loadWeather,
    loadCurrentLocation,
    clearSavedLocation,
    retryWeather,
    climateComparison,
    isLocatingCurrent,
    showGlobalLoading,
    isBackgroundLoading,
    showGlobalError,
    showRefreshError,
    weatherInfo,
    background,
    citySearchRef,
    unit,
    setUnit,
    showClimateContext,
    setShowClimateContext,
  } = useWeatherDashboardViewModel();

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
        isLocatingCurrent={isLocatingCurrent}
        showClimateContext={showClimateContext}
        setShowClimateContext={setShowClimateContext}
        unit={unit}
        setUnit={setUnit}
      />

      <StatusStack
        locationNotice={locationNotice}
        isBackgroundLoading={isBackgroundLoading}
        showRefreshError={showRefreshError}
        onRetry={retryWeather}
      />

      <WeatherDashboard
        weather={weather}
        location={location}
        unit={unit}
        weatherDataUnit={unit}
        climateComparison={climateComparison}
        showClimateContext={showClimateContext}
        isBackgroundLoading={isBackgroundLoading}
        weatherInfo={weatherInfo}
      />
    </AppShell>
  );
}

export default App;
