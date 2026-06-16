import { memo, Suspense } from "react";
import NowcastCard from "../NowcastCard";
import AlertsCard from "../AlertsCard";
import ForecastCard from "../ForecastCard";
import PanelErrorBoundary from "../PanelErrorBoundary";
import { CardFallback } from "../ui";
import { StormWatchPanel, AtmospherePanel } from "../lazyPanels";

function SupplementalWeatherPanels({
  weather,
  unit,
  weatherInfo,
  trustMeta,
  isBackgroundLoading,
  cardStyleVariables,
  groupLabelStyleVariables,
  groupLabelIds,
}) {
  const alertsStatus = trustMeta?.alertsStatus ?? weather?.alertsStatus ?? "idle";

  return (
    <>
      <PanelErrorBoundary
        label="Nowcast"
        className="bento-nowcast"
        style={cardStyleVariables[3]}
      >
        <NowcastCard
          weather={weather}
          style={cardStyleVariables[3]}
          isRefreshing={isBackgroundLoading}
        />
      </PanelErrorBoundary>

      <h2
        id={groupLabelIds.riskSignals}
        className="bento-group-label"
        style={groupLabelStyleVariables[2]}
      >
        Risk Signals
      </h2>
      <PanelErrorBoundary
        label="Severe alerts"
        className="bento-alerts"
        style={cardStyleVariables[5]}
      >
        <AlertsCard
          alerts={weather?.alerts}
          alertsStatus={alertsStatus}
          style={cardStyleVariables[5]}
          isRefreshing={isBackgroundLoading}
        />
      </PanelErrorBoundary>
      <PanelErrorBoundary
        label="Storm watch"
        className="bento-storm"
        style={cardStyleVariables[6]}
      >
        <Suspense
          fallback={(
            <CardFallback
              className="bento-storm"
              style={cardStyleVariables[6]}
              title="Loading risk signals..."
              isRefreshing={isBackgroundLoading}
            />
          )}
        >
          <StormWatchPanel
            weather={weather}
            unit={unit}
            style={cardStyleVariables[6]}
            isRefreshing={isBackgroundLoading}
          />
        </Suspense>
      </PanelErrorBoundary>

      <h2
        id={groupLabelIds.atmosphere}
        className="bento-group-label"
        style={groupLabelStyleVariables[3]}
      >
        Atmosphere
      </h2>
      <PanelErrorBoundary
        label="Atmosphere"
        className="bento-atm"
        style={cardStyleVariables[8]}
      >
        <Suspense
          fallback={(
            <CardFallback
              className="bento-atm"
              style={cardStyleVariables[8]}
              title="Loading atmosphere..."
              isRefreshing={isBackgroundLoading}
            />
          )}
        >
          <AtmospherePanel
            weather={weather}
            aqi={weather?.aqi}
            unit={unit}
            style={cardStyleVariables[8]}
            isRefreshing={isBackgroundLoading}
          />
        </Suspense>
      </PanelErrorBoundary>

      <h2
        id={groupLabelIds.weekAhead}
        className="bento-group-label"
        style={groupLabelStyleVariables[4]}
      >
        Week Ahead
      </h2>
      <PanelErrorBoundary
        label="7-day forecast"
        className="bento-forecast"
        style={cardStyleVariables[7]}
      >
        <ForecastCard
          weather={weather}
          unit={unit}
          style={cardStyleVariables[7]}
          isRefreshing={isBackgroundLoading}
        />
      </PanelErrorBoundary>
    </>
  );
}

export default memo(SupplementalWeatherPanels);
