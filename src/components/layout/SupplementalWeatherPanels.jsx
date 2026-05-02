import { memo, Suspense } from "react";
import NowcastCard from "../NowcastCard";
import AlertsCard from "../AlertsCard";
import ForecastCard from "../ForecastCard";
import { CardFallback } from "../ui";
import { HourlyPanel, StormWatchPanel } from "../lazyPanels";

function SupplementalWeatherPanels({
  weather,
  unit,
  weatherInfo,
  trustMeta,
  isBackgroundLoading,
  nowMs,
  cardStyleVariables,
  groupLabelStyleVariables,
  groupLabelIds,
}) {
  const weatherFetchedAt = trustMeta?.weatherFetchedAt ?? null;
  const alertsFetchedAt = trustMeta?.alertsFetchedAt ?? null;
  const alertsStatus = trustMeta?.alertsStatus ?? weather?.alertsStatus ?? "idle";

  return (
    <>
      <NowcastCard
        weather={weather}
        style={cardStyleVariables[3]}
        isRefreshing={isBackgroundLoading}
        lastUpdatedAt={weatherFetchedAt}
        nowMs={nowMs}
      />
      <Suspense
        fallback={(
          <CardFallback
            className="bento-chart"
            style={cardStyleVariables[4]}
            title="Loading hourly outlook..."
            isRefreshing={isBackgroundLoading}
          />
        )}
      >
        <HourlyPanel
          weather={weather}
          unit={unit}
          chartTopColor={weatherInfo?.gradient?.[0]}
          chartBottomColor={weatherInfo?.gradient?.[2] ?? weatherInfo?.gradient?.[1]}
          style={cardStyleVariables[4]}
          isRefreshing={isBackgroundLoading}
          lastUpdatedAt={weatherFetchedAt}
          nowMs={nowMs}
        />
      </Suspense>

      <h2
        id={groupLabelIds.riskSignals}
        className="bento-group-label"
        style={groupLabelStyleVariables[2]}
      >
        Risk Signals
      </h2>
      <AlertsCard
        alerts={weather?.alerts}
        alertsStatus={alertsStatus}
        style={cardStyleVariables[5]}
        isRefreshing={isBackgroundLoading}
        lastUpdatedAt={alertsFetchedAt}
        nowMs={nowMs}
      />
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
          lastUpdatedAt={weatherFetchedAt}
          nowMs={nowMs}
        />
      </Suspense>

      <h2
        id={groupLabelIds.weekAhead}
        className="bento-group-label"
        style={groupLabelStyleVariables[3]}
      >
        Week Ahead
      </h2>
      <ForecastCard
        weather={weather}
        unit={unit}
        style={cardStyleVariables[7]}
        isRefreshing={isBackgroundLoading}
        lastUpdatedAt={weatherFetchedAt}
        nowMs={nowMs}
      />
    </>
  );
}

export default memo(SupplementalWeatherPanels);
