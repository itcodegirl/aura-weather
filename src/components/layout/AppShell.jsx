import { memo, useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import AtmosphereParticles from "../AtmosphereParticles";
import WeatherIcon from "../WeatherIcon";
import "./AppShell.css";

const SLOW_LOAD_MS = 7000;

const AppLoadingState = memo(() => {
  // Hold the upbeat "Connecting\u2026" for the first 7s \u2014 that's the
  // happy-path window for a healthy network. After that the user
  // deserves a reassurance beat so they don't think the app is frozen.
  // The live region is polite, so this drops in without interrupting
  // assistive tech mid-utterance.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  const loaderText = isSlow
    ? "Still working\u2026 your network may be slow."
    : "Connecting to weather providers\u2026";

  return (
    <div className="app app--loading">
      <div
        className="loading-dashboard"
        role="status"
        aria-live="polite"
        aria-label="Loading weather dashboard"
      >
        <div className="loading-dashboard-header">
          <WeatherIcon
            code={0}
            size={42}
            animated={false}
            className="loader-weather-icon"
          />
          <div>
            <p className="loading-dashboard-brand">Aura</p>
            <p className="loader-text">{loaderText}</p>
          </div>
        </div>
        <div className="loading-dashboard-grid" aria-hidden="true">
          <div className="loading-skeleton loading-skeleton--hero">
            <div className="loading-skeleton-block loading-skeleton-block--meta" />
            <div className="loading-skeleton-block loading-skeleton-block--temp" />
            <div className="loading-skeleton-block loading-skeleton-block--row" />
          </div>
          <div className="loading-skeleton loading-skeleton--panel">
            <div className="loading-skeleton-block loading-skeleton-block--meta" />
            <div className="loading-skeleton-block loading-skeleton-block--gauge" />
          </div>
          <div className="loading-skeleton loading-skeleton--wide">
            <div className="loading-skeleton-block loading-skeleton-block--meta" />
            <div className="loading-skeleton-bars" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, index) => (
                <span
                  key={index}
                  className="loading-skeleton-bar"
                  style={{ animationDelay: `${index * 60}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/*
 * Renders inside AppShell, below the header, rather than replacing the page.
 * It used to be its own `app app--error` screen, which took the city search
 * away at the one moment a reader most needs it — the failure may be specific
 * to the city they are on, and "Reload weather" only retries that city.
 *
 * AppErrorBoundary still owns the `app--error` full-page treatment: a crashed
 * tree cannot be trusted to render a header.
 */
const AppErrorState = memo(({ error, onRetry }) => {
  return (
    <div className="app-error-region">
      <div className="error-card" role="alert" aria-live="assertive">
        <CloudOff size={42} className="error-card-icon" aria-hidden="true" />
        <h1>We couldn't load weather data</h1>
        <p>{error}</p>
        <button
          type="button"
          className="error-retry"
          onClick={onRetry}
        >
          Reload weather
        </button>
      </div>
    </div>
  );
});

function AppShell({
  background,
  conditionCode,
  prefersReducedData = false,
  children,
}) {
  return (
    <div className="app" style={{ background }}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <AtmosphereParticles
        conditionCode={conditionCode}
        prefersReducedData={prefersReducedData}
      />

      <div className="app-inner">{children}</div>
    </div>
  );
}

export { AppLoadingState, AppErrorState };

export default memo(AppShell);
