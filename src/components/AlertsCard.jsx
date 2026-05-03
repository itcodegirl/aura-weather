import { memo, useMemo } from "react";
import { Siren } from "lucide-react";
import { DataTrustMeta } from "./ui";
import "./AlertsCard.css";

function formatAlertTime(value) {
  if (typeof value !== "string") return "Unknown";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const VISIBLE_ALERT_LIMIT = 4;

function AlertsCard({
  alerts,
  alertsStatus = "idle",
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const totalAlertCount = Array.isArray(alerts) ? alerts.length : 0;
  const visibleAlerts = useMemo(() => {
    return Array.isArray(alerts) ? alerts.slice(0, VISIBLE_ALERT_LIMIT) : [];
  }, [alerts]);
  const hiddenAlertCount = Math.max(0, totalAlertCount - visibleAlerts.length);
  const emptyState = useMemo(() => {
    if (visibleAlerts.length > 0 || alertsStatus === "ready") {
      return {
        subtitle: "Priority states",
        trustLabel: "",
        trustTitle: "",
        title: "No active severe alerts",
        copy: "No active NWS weather alerts are currently affecting this location.",
      };
    }

    if (alertsStatus === "unsupported") {
      return {
        subtitle: "Regional coverage",
        trustLabel: "Coverage unavailable",
        trustTitle: "NOAA / NWS alerts are only available for supported U.S. locations.",
        title: "Alerts unavailable for this region",
        copy:
          "Current weather is still live, but NOAA / NWS alert coverage does not extend to this location.",
      };
    }

    if (alertsStatus === "unavailable") {
      return {
        subtitle: "Service issue",
        trustLabel: "Service unavailable",
        trustTitle: "The NOAA / NWS alerts feed did not return a usable response.",
        title: "Could not load severe alerts",
        copy:
          "Current conditions loaded successfully, but the alerts feed did not respond. Refresh for the latest hazard data.",
      };
    }

    return {
      subtitle: "Checking status",
      trustLabel: "Checking alerts",
      trustTitle: "Aura Weather is still checking severe weather coverage for this location.",
      title: "Checking severe alerts",
      copy: "Weather conditions loaded first. Alert coverage will appear as soon as it is confirmed.",
    };
  }, [alertsStatus, visibleAlerts.length]);

  return (
    <section
      className="bento-alerts alerts-card glass"
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="alerts-header">
        <h3 className="alerts-title">
          <Siren size={16} />
          <span>Severe Alerts</span>
        </h3>
        <span className="alerts-subtitle">{emptyState.subtitle}</span>
      </header>

      <DataTrustMeta
        sourceLabel="NOAA / NWS Alerts"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
        staleAfterMinutes={12}
        statusLabel={lastUpdatedAt ? "" : emptyState.trustLabel}
        titleOverride={lastUpdatedAt ? "" : emptyState.trustTitle}
      />

      {visibleAlerts.length === 0 ? (
        <div className="alerts-empty" role="status" aria-live="polite">
          <p className="alerts-empty-title">{emptyState.title}</p>
          <p className="alerts-empty-copy">
            {emptyState.copy}
          </p>
        </div>
      ) : (
        <>
          <ul className="alerts-list" role="list">
            {visibleAlerts.map((alert) => (
              <li
                key={alert.id}
                className={`alerts-item alerts-item--${alert.priority || "low"}`}
                role="listitem"
              >
                <div className="alerts-item-main">
                  <p className="alerts-event">{alert.event}</p>
                  <p className="alerts-headline">
                    {alert.headline || "Severe weather statement in effect"}
                  </p>
                </div>
                <div className="alerts-item-meta">
                  <span className={`alerts-priority alerts-priority--${alert.priority || "low"}`}>
                    {(alert.priority || "low").toUpperCase()}
                  </span>
                  <span className="alerts-window">
                    Until {formatAlertTime(alert.endsAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {hiddenAlertCount > 0 && (
            <p className="alerts-overflow" role="status">
              + {hiddenAlertCount} more {hiddenAlertCount === 1 ? "alert" : "alerts"} not shown.
              Highest-priority alerts are listed first.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default memo(AlertsCard);

