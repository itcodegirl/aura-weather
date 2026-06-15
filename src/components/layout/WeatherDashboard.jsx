import { lazy, memo, Suspense, useCallback, useState } from "react";
import HeroCard from "../HeroCard";
import ExposureSection from "../ExposureSection";
import PanelErrorBoundary from "../PanelErrorBoundary";
import { CardFallback } from "../ui";
import { useDeferredMount } from "../../hooks/useDeferredMount";
import { usePanelPreload } from "../../hooks/useAppShellEffects";
import { PRELOAD_HEAVY_PANELS, RainPanel } from "../lazyPanels";
import { formatDisplayCountry } from "../../utils/locationDisplay";
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
];

const GROUP_LABEL_IDS = {
  currentConditions: "group-current-conditions",
  nearTermOutlook: "group-near-term-outlook",
  riskSignals: "group-risk-signals",
  weekAhead: "group-week-ahead",
};

function WeatherDashboard({
  weather,
  location,
  unit,
  weatherDataUnit,
  climateComparison,
  isBackgroundLoading,
  weatherInfo,
  trustMeta,
  prefersReducedData = false,
}) {
  const showRainPanel = useDeferredMount(Boolean(weather), {
    idleTimeout: 1800,
    fallbackDelay: 900,
  });
  const showSupplementalPanels = useDeferredMount(Boolean(weather), {
    idleTimeout: 2800,
    fallbackDelay: 1800,
  });
  // Once a user opens data-status we keep the panel mounted so the
  // toggle no longer pays for a network round-trip; the chunk is
  // cached after first reveal.
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

  const aqiStatus = trustMeta?.aqiStatus ?? "idle";
  const climateStatus = trustMeta?.climateStatus ?? "idle";

  // Append the active location to the first heading for assistive
  // tech only. Sighted users read "Current Conditions" as a visual
  // eyebrow; screen-reader users hear "Current Conditions in Tokyo,
  // Japan" so the heading list actually tells them where the weather
  // is for instead of four generic group labels in a row.
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
      <h2
        id={GROUP_LABEL_IDS.currentConditions}
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

      <PanelErrorBoundary
        label="Environmental exposure"
        className="bento-exposure"
        style={CARD_STYLE_VARIABLES[1]}
      >
        <ExposureSection
          aqi={weather?.aqi}
          aqiStatus={aqiStatus}
          uvIndex={weather?.daily?.uvIndexMax?.[0]}
          alert={weather?.alerts?.[0]}
          style={CARD_STYLE_VARIABLES[1]}
          isRefreshing={isBackgroundLoading}
        />
      </PanelErrorBoundary>

      <h2
        id={GROUP_LABEL_IDS.nearTermOutlook}
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[1]}
      >
        Near-Term Outlook
      </h2>
      <PanelErrorBoundary
        label="Rain outlook"
        className="bento-rain"
        style={CARD_STYLE_VARIABLES[2]}
      >
        {showRainPanel ? (
          <Suspense
            fallback={(
              <CardFallback
                className="bento-rain"
                style={CARD_STYLE_VARIABLES[2]}
                title="Loading rain outlook..."
                isRefreshing={isBackgroundLoading}
              />
            )}
          >
            <RainPanel
              weather={weather}
              unit={unit}
              dataUnit={weatherDataUnit}
              style={CARD_STYLE_VARIABLES[2]}
              isRefreshing={isBackgroundLoading}
            />
          </Suspense>
        ) : (
          <CardFallback
            className="bento-rain"
            style={CARD_STYLE_VARIABLES[2]}
            title="Loading rain outlook..."
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
            weatherInfo={weatherInfo}
            trustMeta={trustMeta}
            cardStyleVariables={CARD_STYLE_VARIABLES}
            groupLabelStyleVariables={GROUP_LABEL_STYLE_VARIABLES}
            groupLabelIds={GROUP_LABEL_IDS}
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
    prevProps.weatherInfo === nextProps.weatherInfo &&
    prevProps.trustMeta === nextProps.trustMeta &&
    prevProps.prefersReducedData === nextProps.prefersReducedData
  );
}

export default memo(WeatherDashboard, areWeatherDashboardPropsEqual);
