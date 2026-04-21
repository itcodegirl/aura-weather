import { Suspense } from "react";
import HeroCard from "../HeroCard";
import RainCard from "../RainCard";
import ForecastCard from "../ForecastCard";
import NowcastCard from "../NowcastCard";
import ExposureSection from "../ExposureSection";
import SunlightSection from "../SunlightSection";
import { HourlyPanel, StormWatchPanel } from "../lazyPanels";

const CARD_STYLE_VARIABLES = [
  { "--i": 0 },
  { "--i": 1 },
  { "--i": 2 },
  { "--i": 3 },
  { "--i": 4 },
  { "--i": 5 },
  { "--i": 6 },
  { "--i": 7 },
];

const GROUP_LABEL_STYLE_VARIABLES = [
  { "--group-i": 0 },
  { "--group-i": 1 },
  { "--group-i": 2 },
  { "--group-i": 3 },
];

const GROUP_LABEL_IDS = {
  currentConditions: "group-current-conditions",
  nearTermOutlook: "group-near-term-outlook",
  riskSignals: "group-risk-signals",
  weekAhead: "group-week-ahead",
};

function CardFallback({ className, style, title }) {
  return (
    <section className={`${className} loading-card glass`} style={style}>
      <p className="loading-card-title" role="status" aria-live="polite">
        {title}
      </p>
    </section>
  );
}

export default function WeatherDashboard({
  weather,
  location,
  unit,
  weatherDataUnit,
  climateComparison,
  showClimateContext,
  isBackgroundLoading,
  weatherInfo,
}) {
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
      </h2>
      <HeroCard
        weather={weather}
        location={location}
        unit={unit}
        climateComparison={showClimateContext ? climateComparison : null}
        style={CARD_STYLE_VARIABLES[0]}
      />

      <ExposureSection
        aqi={weather.aqi}
        uvIndex={weather.daily?.uvIndexMax?.[0]}
        style={CARD_STYLE_VARIABLES[1]}
      />

      <SunlightSection
        sunrise={weather.daily?.sunrise?.[0]}
        sunset={weather.daily?.sunset?.[0]}
        style={CARD_STYLE_VARIABLES[2]}
      />

      <h2
        id={GROUP_LABEL_IDS.nearTermOutlook}
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[1]}
      >
        Near-Term Outlook
      </h2>
      <RainCard
        weather={weather}
        unit={unit}
        dataUnit={weatherDataUnit}
        style={CARD_STYLE_VARIABLES[3]}
      />
      <NowcastCard weather={weather} style={CARD_STYLE_VARIABLES[4]} />
      <Suspense
        fallback={(
          <CardFallback
            className="bento-chart"
            style={CARD_STYLE_VARIABLES[5]}
            title="Loading hourly outlook..."
          />
        )}
      >
        <HourlyPanel
          weather={weather}
          unit={unit}
          chartTopColor={weatherInfo?.gradient?.[0]}
          chartBottomColor={weatherInfo?.gradient?.[2] ?? weatherInfo?.gradient?.[1]}
          style={CARD_STYLE_VARIABLES[5]}
        />
      </Suspense>

      <h2
        id={GROUP_LABEL_IDS.riskSignals}
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[2]}
      >
        Risk Signals
      </h2>
      <Suspense
        fallback={(
          <CardFallback
            className="bento-storm"
            style={CARD_STYLE_VARIABLES[6]}
            title="Loading risk signals..."
          />
        )}
      >
        <StormWatchPanel
          weather={weather}
          unit={unit}
          style={CARD_STYLE_VARIABLES[6]}
        />
      </Suspense>

      <h2
        id={GROUP_LABEL_IDS.weekAhead}
        className="bento-group-label"
        style={GROUP_LABEL_STYLE_VARIABLES[3]}
      >
        Week Ahead
      </h2>
      <ForecastCard
        weather={weather}
        unit={unit}
        style={CARD_STYLE_VARIABLES[7]}
      />
    </main>
  );
}
