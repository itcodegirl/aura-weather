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

function AlertsCard({
  alerts,
  style,
  isRefreshing = false,
  lastUpdatedAt,
  nowMs,
}) {
  const visibleAlerts = useMemo(() => {
    return Array.isArray(alerts) ? alerts.slice(0, 4) : [];
  }, [alerts]);

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
        <span className="alerts-subtitle">Priority states</span>
      </header>

      <DataTrustMeta
        sourceLabel="NOAA / NWS Alerts"
        lastUpdatedAt={lastUpdatedAt}
        nowMs={nowMs}
        staleAfterMinutes={12}
      />

      {visibleAlerts.length === 0 ? (
        <div className="alerts-empty" role="status" aria-live="polite">
          <p className="alerts-empty-title">No active severe alerts</p>
          <p className="alerts-empty-copy">
            No active NWS weather alerts are currently affecting this location.
          </p>
        </div>
      ) : (
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
      )}
    </section>
  );
}

export default memo(AlertsCard);

