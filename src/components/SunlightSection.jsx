import "./MetricPanels.css";

const SUNLIGHT_LABEL_ID = "metric-sunlight";

function formatClock(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";

  const now = Date.now();
  if (date.getTime() > now + 24 * 60 * 60 * 1000 * 10) {
    return "\u2014";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDayLengthLabel(sunrise, sunset) {
  if (!sunrise || !sunset) return null;
  const sunriseDate = new Date(sunrise);
  const sunsetDate = new Date(sunset);
  if (Number.isNaN(sunriseDate.getTime()) || Number.isNaN(sunsetDate.getTime())) {
    return null;
  }
  let diffMs = sunsetDate.getTime() - sunriseDate.getTime();
  if (diffMs <= 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}

export default function SunlightSection({ sunrise, sunset, style }) {
  const sunriseLabel = formatClock(sunrise);
  const sunsetLabel = formatClock(sunset);
  const dayLengthLabel = getDayLengthLabel(sunrise, sunset);

  return (
    <section
      className="bento-sunlight metric-card glass"
      style={style}
      aria-labelledby={SUNLIGHT_LABEL_ID}
    >
      <div className="metric-head">
        <h2 id={SUNLIGHT_LABEL_ID} className="metric-label">
          Sunlight
        </h2>
        <span className="metric-context">Local</span>
      </div>
      <div className="sun-times" aria-label="Sunrise and sunset times">
        <div className="sun-time-chip">
          <span className="sun-time-label">Sunrise</span>
          <span className="sun-time-value">{sunriseLabel}</span>
        </div>
        <div className="sun-time-chip">
          <span className="sun-time-label">Sunset</span>
          <span className="sun-time-value">{sunsetLabel}</span>
        </div>
      </div>
      {dayLengthLabel ? (
        <div className="metric-sun-length">Daylight {dayLengthLabel}</div>
      ) : (
        <p className="metric-support">Daylight duration is unavailable.</p>
      )}
    </section>
  );
}
