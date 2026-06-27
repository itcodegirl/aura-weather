import { memo } from "react";
import { Bell, CloudRain, AlertTriangle, Sun } from "lucide-react";
import { useRainAlerts } from "../hooks/useRainAlerts";
import "./RainAlertsPanel.css";

const TYPE_META = [
  {
    type: "rain_incoming",
    icon: CloudRain,
    label: "Rain starting soon",
    detail: "A heads-up ~20 min before rain",
  },
  {
    type: "severe",
    icon: AlertTriangle,
    label: "Severe weather",
    detail: "NOAA / NWS watches & warnings (U.S.)",
  },
  {
    type: "morning_brief",
    icon: Sun,
    label: "Morning briefing",
    detail: "A daily 7am rain summary",
  },
];

function RainAlertsPanel({ location }) {
  const {
    available,
    permission,
    enabled,
    subscribed,
    activeTypes,
    busy,
    error,
    testSent,
    enableAll,
    disableAll,
    toggleType,
    sendTest,
  } = useRainAlerts(location);

  // When alerts aren't configured for this build or supported on this device
  // (e.g. a non-installed browser), render nothing rather than a dead control.
  if (!available || !location) {
    return null;
  }

  const locationName =
    typeof location?.name === "string" && location.name.trim()
      ? location.name.trim()
      : "this location";
  const blocked = permission === "denied";

  return (
    <section
      className="bento-alerts-card rain-alerts glass"
      aria-labelledby="rain-alerts-title"
    >
      <header className="rain-alerts-head">
        <h3 id="rain-alerts-title" className="rain-alerts-title">
          <Bell size={16} aria-hidden="true" />
          <span>Rain alerts</span>
        </h3>
        <span className="rain-alerts-status">
          {blocked
            ? "Notifications blocked"
            : enabled
              ? `On for ${locationName}`
              : "Off"}
        </span>
      </header>

      {blocked ? (
        <p className="rain-alerts-note">
          Notifications are blocked for this site. Allow them in your browser
          settings, then turn rain alerts back on here.
        </p>
      ) : (
        <>
          <ul className="rain-alerts-types" aria-label="Alert types">
            {TYPE_META.map((meta) => {
              const Icon = meta.icon;
              const on = Boolean(activeTypes[meta.type]);
              return (
                <li key={meta.type} className="rain-alerts-type">
                  <span className="rain-alerts-type-icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span className="rain-alerts-type-copy">
                    <span className="rain-alerts-type-label">{meta.label}</span>
                    <span className="rain-alerts-type-detail">{meta.detail}</span>
                  </span>
                  <button
                    type="button"
                    className={`rain-alerts-toggle${on ? " is-on" : ""}`}
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Turn off" : "Turn on"} ${meta.label.toLowerCase()} for ${locationName}`}
                    disabled={busy}
                    onClick={() => toggleType(meta.type)}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rain-alerts-actions">
            {enabled ? (
              <button
                type="button"
                className="rain-alerts-btn"
                disabled={busy}
                onClick={disableAll}
              >
                Turn off all
              </button>
            ) : (
              <button
                type="button"
                className="rain-alerts-btn rain-alerts-btn--primary"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={enableAll}
              >
                {busy ? "Setting up…" : "Turn on rain alerts"}
              </button>
            )}
            <button
              type="button"
              className="rain-alerts-btn"
              disabled={busy || !subscribed}
              onClick={sendTest}
            >
              Send test
            </button>
          </div>
        </>
      )}

      {testSent && (
        <p className="rain-alerts-note rain-alerts-note--ok" role="status">
          Test sent — check your notifications.
        </p>
      )}
      {error && (
        <p className="rain-alerts-note rain-alerts-note--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default memo(RainAlertsPanel);
