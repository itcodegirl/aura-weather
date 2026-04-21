import HeaderControls from "../HeaderControls";

export default function AppHeader({
  citySearchRef,
  loadWeather,
  loadCurrentLocation,
  isLocatingCurrent,
  showClimateContext,
  setShowClimateContext,
  unit,
  setUnit,
}) {
  return (
    <header className="app-header glass">
      <div className="brand-wrap">
        <img
          src="/atmosphere-ring.svg"
          alt="Atmospheric icon"
          className="brand-mark"
          width="28"
          height="28"
          loading="lazy"
        />
        <h1 className="brand">Aura</h1>
        <p className="tagline">Atmospheric Intelligence</p>
      </div>
      <HeaderControls
        citySearchRef={citySearchRef}
        loadWeather={loadWeather}
        loadCurrentLocation={loadCurrentLocation}
        isLocatingCurrent={isLocatingCurrent}
        showClimateContext={showClimateContext}
        setShowClimateContext={setShowClimateContext}
        unit={unit}
        setUnit={setUnit}
      />
    </header>
  );
}
