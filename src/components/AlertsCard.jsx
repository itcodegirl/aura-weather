import { memo, useId, useMemo } from "react";
import { Siren } from "lucide-react";
import { useTimeNow } from "../hooks/useTimeNow";
import { formatStampWithZoneName } from "../utils/formatters";
import { toAlertParagraphs } from "../domain/alertText";
import "./AlertsCard.css";

/*
 * NWS `expires` is an offset-bearing ISO timestamp for the alert *area*, so
 * the instant is right but the frame it is displayed in was the reader's.
 * A Chicago tornado warning read to a viewer in London printed six hours
 * off — the same device-clock bug already fixed for the pressure trend and
 * the sun arc. Render it in the alerted location's zone, falling back to
 * the device format if the provider gave us an unusable zone.
 */
function formatAlertTime(value, timeZone) {
  if (typeof value !== "string") return "Unknown";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";

  return formatStampWithZoneName(parsed, timeZone);
}

const VISIBLE_ALERT_LIMIT = 4;

/*
 * The protective action, and the full advisory behind it.
 *
 * Both fields reached the app already — `description` was normalised and
 * read by nothing, `instruction` was not normalised at all — so a warning
 * rendered its name, one headline line and an expiry, and dropped the
 * sentence telling the reader what to do.
 *
 * They are split rather than stacked because their lengths differ by a
 * factor of three: across the 2026-09-17 active feed `instruction` ran a
 * 163-character median against `description`'s 548. The short, actionable
 * one is always visible; the long one is a disclosure, so the card stays
 * scannable with four alerts open.
 *
 * When `instruction` is absent nothing is said about it. It is missing on
 * 40% of alerts overall but on none carrying `urgency: Immediate`, so an
 * "instructions unavailable" line would fire almost exclusively on small
 * craft advisories — noise where the app's own rule is that a missing
 * answer is silence, not an apology.
 */
function AlertGuidance({ instruction, description }) {
  const guidance = useMemo(() => toAlertParagraphs(instruction), [instruction]);
  const detail = useMemo(() => toAlertParagraphs(description), [description]);

  return (
    <>
      {guidance.length > 0 && (
        <div className="alerts-instruction">
          {/* Names the prose for a screen reader, which otherwise hears it
              run straight on from the headline with no cue that the voice
              has changed from what is happening to what to do. */}
          <span className="sr-only">What to do: </span>
          {guidance.map((paragraph) => (
            <p key={paragraph} className="alerts-instruction-line">
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {detail.length > 0 && (
        <details className="alerts-detail">
          <summary className="alerts-detail-summary">Full advisory text</summary>
          <div className="alerts-detail-body">
            {detail.map((paragraph) => (
              <p key={paragraph} className="alerts-detail-line">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function AlertsCard({
  alerts,
  alertsStatus = "idle",
  style,
  isRefreshing = false,
  timeZone,
}) {
  const titleId = useId();
  // Shared minute ticker (the app-wide clock seam) rather than Date.now()
  // in render: it keeps this component pure and also retires an alert
  // within a minute of it expiring while the page is open.
  const nowMs = useTimeNow();
  /*
   * Defence in depth against showing an expired hazard as active. The
   * restore path in useWeatherData already drops alerts past their
   * `endsAt`, but this card is the surface where being wrong is most
   * costly, so it refuses to render one regardless of how it arrived.
   * Live NWS responses only contain active alerts, so this filters
   * nothing on the happy path.
   */
  const activeAlerts = useMemo(() => {
    if (!Array.isArray(alerts)) return [];
    return alerts.filter((alert) => {
      const expiresAt = Date.parse(alert?.endsAt);
      return Number.isFinite(expiresAt) && expiresAt > nowMs;
    });
  }, [alerts, nowMs]);
  const totalAlertCount = activeAlerts.length;
  const visibleAlerts = useMemo(
    () => activeAlerts.slice(0, VISIBLE_ALERT_LIMIT),
    [activeAlerts]
  );
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
        {/* h2, not h3: this card renders at the top of <main> before the
            first <h2> group label, so an <h3> here would skip a heading
            level (h1 -> h3) for the most urgent element on the page. */}
        <h2 id={titleId} className="alerts-title">
          <Siren size={16} aria-hidden="true" />
          <span>Severe Alerts</span>
        </h2>
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
                  <AlertGuidance
                    instruction={alert.instruction}
                    description={alert.description}
                  />
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
                    Until {formatAlertTime(alert.endsAt, timeZone)}
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

