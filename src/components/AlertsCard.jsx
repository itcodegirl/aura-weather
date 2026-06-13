import { memo, useId, useMemo } from "react";
import { Siren } from "lucide-react";
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
}) {
  const titleId = useId();
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

  // Don't render the panel at all when there are no alerts AND the
  // feed reported a successful empty list (or is still pending). The
  // audit's principle: do not narrate a non-event in tense vocabulary.
  // "Unsupported" and "unavailable" still render because those are
  // information the user needs (no coverage, or a feed outage).
  const hasActiveAlerts = visibleAlerts.length > 0;
  const isInformationalStatus =
    alertsStatus === "unsupported" || alertsStatus === "unavailable";
  if (!hasActiveAlerts && !isInformationalStatus) {
    return null;
  }

  return (
    <section
      className="bento-alerts alerts-card glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="alerts-header">
        <h3 id={titleId} className="alerts-title">
          <Siren size={16} aria-hidden="true" />
          <span>Severe Alerts</span>
        </h3>
        <span className="alerts-subtitle">{emptyState.subtitle}</span>
      </header>

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
                  {/*
                   * Priority badge: text content stays in normal case so
                   * (a) copy-paste produces a readable word, (b) screen-
                   * reader engines that spell out short all-caps strings
                   * letter-by-letter read it as "high" / "extreme" /
                   * "moderate". CSS text-transform: uppercase handles the
                   * visual presentation. aria-label ties the floating
                   * badge text to its semantic meaning ("Priority: high")
                   * so a SR user hears context, not just an adjective.
                   */}
                  <span
                    className={`alerts-priority alerts-priority--${alert.priority || "low"}`}
                    aria-label={`Priority: ${alert.priority || "low"}`}
                  >
                    {alert.priority || "low"}
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

