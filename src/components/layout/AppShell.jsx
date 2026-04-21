import { CloudOff } from "lucide-react";
import WeatherIcon from "../WeatherIcon";

export function AppLoadingState() {
  return (
    <div className="app app--loading">
      <div
        className="loader"
        role="status"
        aria-live="polite"
        aria-label="Loading weather data"
      >
        <WeatherIcon
          code={0}
          size={80}
          animated={false}
          className="loader-weather-icon"
        />
        <p className="loader-text">Loading live conditions{"\u2026"}</p>
      </div>
    </div>
  );
}

export function AppErrorState({ error, onRetry }) {
  return (
    <div className="app app--error">
      <div className="error-card">
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
}

export default function AppShell({ background, children }) {
  return (
    <div className="app" style={{ background }}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="ambient-blob ambient-blob--tl" />
      <div className="ambient-blob ambient-blob--br" />

      <div className="app-inner">{children}</div>
    </div>
  );
}
