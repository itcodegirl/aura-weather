import { memo, useMemo } from "react";
import {
  Activity,
  CloudSun,
  Database,
  ShieldAlert,
  Wind,
} from "lucide-react";
import { formatLastUpdatedLabel } from "../utils/dataTrust";
import { useTimeNow } from "../hooks/useTimeNow";
import "./SourceHealthPanel.css";

function getForecastSource(trustMeta, nowMs) {
  const weatherFetchedAt = trustMeta?.weatherFetchedAt ?? null;
  const cacheStatus = trustMeta?.cacheStatus ?? "idle";
  const forecastStatus = trustMeta?.forecastStatus ?? "idle";

  if (cacheStatus === "restored") {
    return {
      key: "forecast",
      icon: CloudSun,
      name: "Forecast",
      provider: "Open-Meteo",
      status: "cached",
      label: "Saved",
      detail: weatherFetchedAt
        ? formatLastUpdatedLabel(weatherFetchedAt, nowMs)
        : "Last live update unavailable",
    };
  }

  if (weatherFetchedAt) {
    return {
      key: "forecast",
      icon: CloudSun,
      name: "Forecast",
      provider: "Open-Meteo",
      status: "ready",
      label: "Live",
      detail: formatLastUpdatedLabel(weatherFetchedAt, nowMs),
    };
  }

  return {
    key: "forecast",
    icon: CloudSun,
    name: "Forecast",
    provider: "Open-Meteo",
    status: forecastStatus === "unavailable" ? "unavailable" : "pending",
    label: forecastStatus === "unavailable" ? "Issue" : "Pending",
    detail: "Waiting for current conditions",
  };
}

// A restored snapshot replays the supplemental statuses it was captured
// with, so a "ready"/fetched-at pair there dates the saved blob, not a
// live provider read — those rows must render as Saved, never Live.
function isRestoredSnapshot(trustMeta) {
  return (trustMeta?.cacheStatus ?? "idle") === "restored";
}

function getAqiSource(trustMeta, nowMs) {
  const aqiFetchedAt = trustMeta?.aqiFetchedAt ?? null;
  const aqiStatus = trustMeta?.aqiStatus ?? "idle";
  const isRestored = isRestoredSnapshot(trustMeta);

  if (aqiFetchedAt) {
    return {
      key: "aqi",
      icon: Wind,
      name: "Air Quality",
      provider: "Open-Meteo AQI",
      status: isRestored ? "cached" : "ready",
      label: isRestored ? "Saved" : "Live",
      detail: formatLastUpdatedLabel(aqiFetchedAt, nowMs),
    };
  }

  if (aqiStatus === "unavailable") {
    return {
      key: "aqi",
      icon: Wind,
      name: "Air Quality",
      provider: "Open-Meteo AQI",
      status: "unavailable",
      label: "No reading",
      detail: "Air-quality reading is missing right now",
    };
  }

  return {
    key: "aqi",
    icon: Wind,
    name: "Air Quality",
    provider: "Open-Meteo AQI",
    status: "pending",
    label: "Pending",
    detail: "Loading after the forecast",
  };
}

function getAlertsSource(trustMeta, nowMs) {
  const alertsFetchedAt = trustMeta?.alertsFetchedAt ?? null;
  const alertsStatus = trustMeta?.alertsStatus ?? "idle";
  const isRestored = isRestoredSnapshot(trustMeta);

  if (alertsStatus === "ready") {
    return {
      key: "alerts",
      icon: ShieldAlert,
      name: "Alerts",
      provider: "NOAA / NWS",
      status: isRestored ? "cached" : "ready",
      label: isRestored ? "Saved" : "Live",
      detail: alertsFetchedAt
        ? formatLastUpdatedLabel(alertsFetchedAt, nowMs)
        : "No active alerts returned",
    };
  }

  if (alertsStatus === "unsupported") {
    return {
      key: "alerts",
      icon: ShieldAlert,
      name: "Alerts",
      provider: "NOAA / NWS",
      status: "limited",
      label: "Not covered",
      detail: "U.S. alerts only",
    };
  }

  if (alertsStatus === "unavailable") {
    return {
      key: "alerts",
      icon: ShieldAlert,
      name: "Alerts",
      provider: "NOAA / NWS",
      status: "unavailable",
      label: "Issue",
      detail: "Provider did not respond",
    };
  }

  return {
    key: "alerts",
    icon: ShieldAlert,
    name: "Alerts",
    provider: "NOAA / NWS",
    status: "pending",
    label: "Checking",
    detail: "Coverage lookup in progress",
  };
}

function getClimateSource(trustMeta, nowMs) {
  const climateFetchedAt = trustMeta?.climateFetchedAt ?? null;
  const climateStatus = trustMeta?.climateStatus ?? "idle";

  if (climateStatus === "ready") {
    return {
      key: "climate",
      icon: Database,
      name: "Historical comparison",
      provider: "Open-Meteo Archive",
      status: "ready",
      label: "Live",
      detail: climateFetchedAt
        ? formatLastUpdatedLabel(climateFetchedAt, nowMs)
        : "Comparison against the historical normal is ready",
    };
  }

  if (climateStatus === "disabled") {
    return {
      key: "climate",
      icon: Database,
      name: "Historical comparison",
      provider: "Open-Meteo Archive",
      status: "limited",
      label: "Reduced data",
      detail: "Paused while saving data",
    };
  }

  if (climateStatus === "unavailable") {
    return {
      key: "climate",
      icon: Database,
      name: "Historical comparison",
      provider: "Open-Meteo Archive",
      status: "unavailable",
      label: "Unavailable",
      detail: "Couldn’t reach the historical normals right now",
    };
  }

  return {
    key: "climate",
    icon: Database,
    name: "Historical comparison",
    provider: "Open-Meteo Archive",
    status: climateStatus === "loading" ? "pending" : "idle",
    label: climateStatus === "loading" ? "Loading" : "Pending",
    detail: "Looking up the historical normal",
  };
}

function SourceHealthPanel({
  trustMeta,
  style,
  isRefreshing = false,
  nowMs: overrideNowMs,
}) {
  // Subscribe directly so the dashboard does not have to forward
  // nowMs through the bento — only this panel needs the minute
  // tick for "Updated Nm ago" labels, so only this panel re-renders.
  // Tests pass an explicit nowMs to lock the rendered relative time;
  // production never threads the value.
  const tickNowMs = useTimeNow();
  const nowMs = overrideNowMs ?? tickNowMs;
  const sources = useMemo(
    () => [
      getForecastSource(trustMeta, nowMs),
      getAqiSource(trustMeta, nowMs),
      getAlertsSource(trustMeta, nowMs),
      getClimateSource(trustMeta, nowMs),
    ],
    [nowMs, trustMeta]
  );

  return (
    <section
      className="bento-source-health source-health-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
      aria-labelledby="source-health-title"
    >
      <header className="source-health-header">
        <div>
          <p className="source-health-kicker">Where this data comes from</p>
          <h3 id="source-health-title" className="source-health-title">
            <Activity size={16} aria-hidden="true" />
            <span>Data sources</span>
          </h3>
        </div>
        <p className="source-health-summary">
          Forecast, air quality, alerts, and historical comparison.
        </p>
      </header>

      <ul className="source-health-list" role="list">
        {sources.map((source) => {
          const Icon = source.icon;
          return (
            <li
              key={source.key}
              className={`source-health-item source-health-item--${source.status}`}
            >
              <Icon size={17} className="source-health-icon" aria-hidden="true" />
              <div className="source-health-main">
                <p className="source-health-name">{source.name}</p>
                <p className="source-health-provider">{source.provider}</p>
              </div>
              <div className="source-health-state">
                <span className="source-health-pill">{source.label}</span>
                <span className="source-health-detail">{source.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(SourceHealthPanel);
