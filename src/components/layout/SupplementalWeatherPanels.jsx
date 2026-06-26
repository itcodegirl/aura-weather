import { memo, Suspense } from "react";
import NowcastCard from "../NowcastCard";
import ForecastCard from "../ForecastCard";
import PanelErrorBoundary from "../PanelErrorBoundary";
import { CardFallback } from "../ui";
import { StormWatchPanel, AtmospherePanel, RainPanel } from "../lazyPanels";

function SupplementalWeatherPanels({
  weather,
  unit,
  weatherDataUnit,
  trustMeta,
  isBackgroundLoading,
  cardStyleVariables,
  groupLabelStyleVariables,
}) {
  void trustMeta; // retained for API parity; not read in this section

  return (
    <>
      <h2
        id="group-nowcast"
        className="bento-group-label"
        style={groupLabelStyleVariables[3]}
      >
        Nowcast
      </h2>
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
        id="group-atmosphere"
        className="bento-group-label"
        style={groupLabelStyleVariables[4]}
      >
        Atmospheric Conditions
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
        id="group-rain-outlook"
        className="bento-group-label"
        style={groupLabelStyleVariables[5]}
      >
        Precipitation Outlook
      </h2>
      <PanelErrorBoundary
        label="Rain outlook"
        className="bento-rain"
        style={cardStyleVariables[2]}
      >
        <Suspense
          fallback={(
            <CardFallback
              className="bento-rain"
              style={cardStyleVariables[2]}
              title="Loading rain outlook..."
              isRefreshing={isBackgroundLoading}
            />
          )}
        >
          <RainPanel
            weather={weather}
            unit={unit}
            dataUnit={weatherDataUnit}
            style={cardStyleVariables[2]}
            isRefreshing={isBackgroundLoading}
          />
        </Suspense>
      </PanelErrorBoundary>

      <h2
        id="group-storm-watch"
        className="bento-group-label"
        style={groupLabelStyleVariables[6]}
      >
        Storm Watch
      </h2>
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
              title="Loading storm watch..."
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
        id="group-week-ahead"
        className="bento-group-label"
        style={groupLabelStyleVariables[7]}
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
