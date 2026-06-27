import { lazy, memo, Suspense, useCallback, useState } from "react";
import HeroCard from "../HeroCard";
import AlertsCard from "../AlertsCard";
import RainAlertsPanel from "../RainAlertsPanel";
import PanelErrorBoundary from "../PanelErrorBoundary";
import { CardFallback } from "../ui";
import { useDeferredMount } from "../../hooks/useDeferredMount";
import { usePanelPreload } from "../../hooks/useAppShellEffects";
import { PRELOAD_HEAVY_PANELS, HourlyPanel, RadarPanel } from "../lazyPanels";
import { formatDisplayCountry } from "../../utils/locationDisplay";
import DataTrustFooter from "../DataTrustFooter";
import "./WeatherDashboard.css";
const SupplementalWeatherPanels = lazy(() => import("./SupplementalWeatherPanels"));
// Data-status is a diagnostic surface most users never open. Defer
// the JS + CSS into its own chunk so the bento's first paint does
// not pay for a panel collapsed behind <details> by default.
const SourceHealthPanel = lazy(() => import("../SourceHealthPanel"));

const CARD_STYLE_VARIABLES = [
  { "--i": 0 },
  { "--i": 1 },
  { "--i": 2 },
  { "--i": 3 },
  { "--i": 4 },
  { "--i": 5 },
  { "--i": 6 },
  { "--i": 7 },
  { "--i": 8 },
];

const GROUP_LABEL_STYLE_VARIABLES = [
  { "--group-i": 0 },
  { "--group-i": 1 },
  { "--group-i": 2 },
  { "--group-i": 3 },
  { "--group-i": 4 },
  { "--group-i": 5 },
  { "--group-i": 6 },
  { "--group-i": 7 },
];

function WeatherDashboard({
  weather,
  location,
  unit,
  weatherDataUnit,
  climateComparison,
  isBackgroundLoading,
  trustMeta,
  prefersReducedData = false,
}) {
  const showHourlyPanel = useDeferredMount(Boolean(weather), {
    idleTimeout: 1800,
    fallbackDelay: 900,
  });
  // Radar pulls in Leaflet, so defer it further than the other panels —
  // it gates on a resolved location (its only input) rather than weather.
  const showRadarPanel = useDeferredMount(Boolean(location), {
    idleTimeout: 3200,
    fallbackDelay: 2000,
  });
  const showSupplementalPanels = useDeferredMount(Boolean(weather), {
    idleTimeout: 2800,
    fallbackDelay: 1800,
  });
  const [hasOpenedSourceHealth, setHasOpenedSourceHealth] = useState(false);
  const handleSourceHealthToggle = useCallback((event) => {
    if (event.currentTarget?.open) {
      setHasOpenedSourceHealth(true);
    }
  }, []);

  usePanelPreload(PRELOAD_HEAVY_PANELS, {
    enabled: !prefersReducedData,
    idleTimeout: 5000,
    fallbackDelay: 4200,
  });

  const climateStatus = trustMeta?.climateStatus ?? "idle";
  const alertsStatus = trustMeta?.alertsStatus ?? weather?.alertsStatus ?? "idle";
  // Severe-alert banner only renders when there are active alerts for this
  // area, or when coverage/feed status itself is informative.
  const hasAlerts = Array.isArray(weather?.alerts) && weather.alerts.length > 0;
  const showAlertsPanel =
    hasAlerts || alertsStatus === "unsupported" || alertsStatus === "unavailable";

  const dashboardLocationName =
    typeof location?.name === "string" ? location.name.trim() : "";
  const dashboardLocationCountry =
    typeof location?.country === "string"
      ? formatDisplayCountry(location.country)
      : "";
  const accessibleLocationSuffix = dashboardLocationName
    ? ` in ${dashboardLocationName}${
        dashboardLocationCountry ? `, ${dashboardLocationCountry}` : ""
      }`
    : "";

  return (
    <main
      className="bento"
      id="main-content"
      aria-busy={isBackgroundLoading}
      tabIndex={-1}
    >
      {/* Severe-alert banner — top of the page, only when alerts are active */}
      {showAlertsPanel && (
        <PanelErrorBoundary
          label="Severe alerts"
          className="bento-alerts"
          style={CARD_STYLE_VARIABLES[5]}
        >
          <AlertsCard
            alerts={weather.alerts}
            alertsStatus={alertsStatus}
            style={CARD_STYLE_VARIABLES[5]}
            isRefreshing={isBackgroundLoading}
          />
        </PanelErrorBoundary>
      )}

      <h2
        id="group-current-conditions"
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[0]}
      >
        Current Conditions
        {accessibleLocationSuffix && (
          <span className="sr-only">{accessibleLocationSuffix}</span>
        )}
      </h2>
      <PanelErrorBoundary
        label="Current weather"
        className="bento-hero"
        style={CARD_STYLE_VARIABLES[0]}
      >
        <HeroCard
          weather={weather}
          location={location}
          unit={unit}
          climateComparison={climateComparison}
          climateStatus={climateStatus}
          style={CARD_STYLE_VARIABLES[0]}
          isRefreshing={isBackgroundLoading}
          aqi={weather?.aqi}
          trustMeta={trustMeta}
        />
      </PanelErrorBoundary>

      <h2
        id="group-hourly"
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[1]}
      >
        Near-Term Outlook
      </h2>
      <PanelErrorBoundary
        label="Hourly forecast"
        className="bento-chart hourly-chart"
        style={CARD_STYLE_VARIABLES[1]}
      >
        {showHourlyPanel ? (
          <Suspense
            fallback={(
              <CardFallback
                className="bento-chart hourly-chart"
                style={CARD_STYLE_VARIABLES[1]}
                title="Loading hourly forecast..."
                isRefreshing={isBackgroundLoading}
              />
            )}
          >
            <HourlyPanel
              weather={weather}
              unit={unit}
              style={CARD_STYLE_VARIABLES[1]}
              isRefreshing={isBackgroundLoading}
            />
          </Suspense>
        ) : (
          <CardFallback
            className="bento-chart hourly-chart"
            style={CARD_STYLE_VARIABLES[1]}
            title="Loading hourly forecast..."
            isRefreshing={isBackgroundLoading}
          />
        )}
      </PanelErrorBoundary>

      <h2
        id="group-radar"
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[2]}
      >
        Precipitation Radar
      </h2>
      <PanelErrorBoundary
        label="Precipitation radar"
        className="bento-radar"
        style={CARD_STYLE_VARIABLES[4]}
      >
        {showRadarPanel ? (
          <Suspense
            fallback={(
              <CardFallback
                className="bento-radar"
                style={CARD_STYLE_VARIABLES[4]}
                title="Loading precipitation radar..."
                isRefreshing={isBackgroundLoading}
              />
            )}
          >
            <RadarPanel
              location={location}
              style={CARD_STYLE_VARIABLES[4]}
              isRefreshing={isBackgroundLoading}
            />
          </Suspense>
        ) : (
          <CardFallback
            className="bento-radar"
            style={CARD_STYLE_VARIABLES[4]}
            title="Loading precipitation radar..."
            isRefreshing={isBackgroundLoading}
          />
        )}
      </PanelErrorBoundary>

      {showSupplementalPanels ? (
        <Suspense
          fallback={(
            <CardFallback
              className="bento-supplemental-loading"
              style={CARD_STYLE_VARIABLES[3]}
              title="Loading extended weather details..."
              isRefreshing={isBackgroundLoading}
            />
          )}
        >
          <SupplementalWeatherPanels
            weather={weather}
            unit={unit}
            weatherDataUnit={weatherDataUnit}
            trustMeta={trustMeta}
            cardStyleVariables={CARD_STYLE_VARIABLES}
            groupLabelStyleVariables={GROUP_LABEL_STYLE_VARIABLES}
            isBackgroundLoading={isBackgroundLoading}
          />
        </Suspense>
      ) : (
        <CardFallback
          className="bento-supplemental-loading"
          style={CARD_STYLE_VARIABLES[3]}
          title="Loading extended weather details..."
          isRefreshing={isBackgroundLoading}
        />
      )}
      <PanelErrorBoundary label="Rain alerts" className="bento-alerts-card">
        <RainAlertsPanel location={location} />
      </PanelErrorBoundary>

      <details
        className="data-status-disclosure"
        onToggle={handleSourceHealthToggle}
      >
        <summary className="data-status-summary">
          <span className="data-status-summary-label">Where this data comes from</span>
          <span className="data-status-summary-hint">
            Forecast, air quality, alerts, historical comparison
          </span>
        </summary>
        {hasOpenedSourceHealth ? (
          <Suspense
            fallback={(
              <CardFallback
                className="bento-source-health"
                style={CARD_STYLE_VARIABLES[8]}
                title="Loading data status..."
                isRefreshing={isBackgroundLoading}
              />
            )}
          >
            <SourceHealthPanel
              trustMeta={trustMeta}
              style={CARD_STYLE_VARIABLES[8]}
              isRefreshing={isBackgroundLoading}
            />
          </Suspense>
        ) : null}
      </details>
      <DataTrustFooter
        weather={weather}
        location={location}
        trustMeta={trustMeta}
      />
    </main>
  );
}

function areWeatherDashboardPropsEqual(prevProps, nextProps) {
  return (
    prevProps.weather === nextProps.weather &&
    prevProps.location === nextProps.location &&
    prevProps.unit === nextProps.unit &&
    prevProps.weatherDataUnit === nextProps.weatherDataUnit &&
    prevProps.climateComparison === nextProps.climateComparison &&
    prevProps.isBackgroundLoading === nextProps.isBackgroundLoading &&
    prevProps.trustMeta === nextProps.trustMeta &&
    prevProps.prefersReducedData === nextProps.prefersReducedData
  );
}

export default memo(WeatherDashboard, areWeatherDashboardPropsEqual);
