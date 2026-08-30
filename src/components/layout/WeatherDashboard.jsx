import { memo, Suspense, useCallback, useState } from "react";
import { Radar } from "lucide-react";
import HeroCard from "../HeroCard";
import AlertsCard from "../AlertsCard";
import PanelErrorBoundary from "../PanelErrorBoundary";
import { CardFallback } from "../ui";
import { useDeferredMount } from "../../hooks/useDeferredMount";
import { usePanelPreload } from "../../hooks/useAppShellEffects";
import {
  createRetryablePanel,
  PRELOAD_HEAVY_PANELS,
  HourlyPanel,
  RadarPanel,
} from "../lazyPanels";
import { formatDisplayCountry } from "../../utils/locationDisplay";
import DataTrustFooter from "../DataTrustFooter";
import "./WeatherDashboard.css";
const SupplementalWeatherPanels = createRetryablePanel(
  () => import("./SupplementalWeatherPanels")
);
// Data-status is a diagnostic surface most users never open. Defer
// the JS + CSS into its own chunk so the bento's first paint does
// not pay for a panel collapsed behind <details> by default.
const SourceHealthPanel = createRetryablePanel(
  () => import("../SourceHealthPanel")
);
/*
 * Rain alerts was the one panel mounted eagerly, and it is the most
 * expensive to mount: useRainAlerts runs on mount and reaches Supabase, so
 * @supabase/supabase-js (201 KB raw / ~51 KB gzip) was dynamically imported
 * during hydration on every visit — landing ahead of HourlyCard and every
 * deferred panel — even for the overwhelming majority of visitors who have
 * never enabled an alert. This is invisible locally and in CI because
 * neither has Supabase env vars, so isAlertsAvailable() is false and the
 * import never happens; production has them.
 *
 * Deferring the mount keeps behaviour identical (the panel still loads its
 * rules, including any set on another device) while moving the cost off the
 * critical path.
 */
const RainAlertsPanel = createRetryablePanel(() => import("../RainAlertsPanel"));

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
  isMissingMock = false,
}) {
  const showHourlyPanel = useDeferredMount(Boolean(weather), {
    idleTimeout: 1800,
    fallbackDelay: 900,
  });
  // Radar pulls in Leaflet, so defer it further than the other panels —
  // it gates on a resolved location (its only input) rather than weather.
  // The missing-data demo promises "live providers are not queried", so
  // it must never mount: useRadarFrames fetches RainViewer on mount and
  // the map fetches basemap/radar tiles.
  const showRadarPanel = useDeferredMount(Boolean(location) && !isMissingMock, {
    idleTimeout: 3200,
    fallbackDelay: 2000,
  });
  const showSupplementalPanels = useDeferredMount(Boolean(weather), {
    idleTimeout: 2800,
    fallbackDelay: 1800,
  });
  // Deferred further than the weather panels: nothing about the forecast
  // depends on it, and it is the only mount that can pull in Supabase —
  // which is also why the missing-data demo must never mount it.
  const showRainAlertsPanel = useDeferredMount(
    Boolean(location) && !isMissingMock,
    {
      idleTimeout: 4000,
      fallbackDelay: 3000,
    }
  );
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
        <span className="bento-group-scope">Right now</span>
      </h2>
      <PanelErrorBoundary
        label="Precipitation radar"
        className="bento-radar"
        style={CARD_STYLE_VARIABLES[4]}
      >
        {isMissingMock ? (
          /* The demo's slot stays honest AND filled: the shared card-empty
             recipe instead of a mounted RadarPanel, so no RainViewer or
             basemap-tile request can leave this page. */
          <section
            className="bento-radar glass"
            style={CARD_STYLE_VARIABLES[4]}
            aria-label="Precipitation radar not queried in this demo"
          >
            <div className="card-empty" role="status">
              <div className="card-empty__icon">
                <Radar size={36} aria-hidden="true" />
              </div>
              <p className="card-empty__title">Radar not queried in this demo</p>
              <p className="card-empty__copy">
                This portfolio demo renders entirely from local mock data, so
                the live radar provider and map tiles are never contacted.
              </p>
            </div>
          </section>
        ) : showRadarPanel ? (
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
              timeZone={weather?.meta?.timezone}
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

      {/* The five per-panel boundaries for these cards ship inside this chunk,
          so they cannot catch the chunk's own load failure. Without a boundary
          out here that failure reaches the app-level boundary and replaces the
          whole dashboard, forecast included. */}
      <PanelErrorBoundary
        label="Extended weather details"
        className="bento-supplemental-loading"
        style={CARD_STYLE_VARIABLES[3]}
      >
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
      </PanelErrorBoundary>
      <PanelErrorBoundary label="Rain alerts" className="bento-alerts-card">
        {/* !isMissingMock repeated here on purpose: useDeferredMount
            starts true off-browser, and the demo's isolation promise
            must not depend on that environment detail. */}
        {showRainAlertsPanel && !isMissingMock ? (
          <Suspense fallback={null}>
            <RainAlertsPanel location={location} />
          </Suspense>
        ) : null}
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
        <PanelErrorBoundary
          label="Data status"
          className="bento-source-health"
          style={CARD_STYLE_VARIABLES[8]}
        >
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
        </PanelErrorBoundary>
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
    prevProps.prefersReducedData === nextProps.prefersReducedData &&
    prevProps.isMissingMock === nextProps.isMissingMock
  );
}

export default memo(WeatherDashboard, areWeatherDashboardPropsEqual);
