import { memo } from "react";
import InfoDrawer from "./InfoDrawer";
import "../MetricPanels.css";

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = (Math.PI / 180) * angle;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function ArcGauge({
  value,
  min = 0,
  max,
  statusColor = "#f97316",
  label,
  decimals = 0,
  hasData = false,
}) {
  const safe = hasData ? clamp(value, min, max) : min;
  const span = clamp(max - min, 0.0001, Number.POSITIVE_INFINITY);
  const progress = (safe - min) / span;
  const cx = 58;
  const cy = 60;
  const r = 44;
  const start = -140;
  const end = 100;
  const safeValue = hasData ? Number(value).toFixed(decimals) : "\u2014";
  const gaugeLabel = hasData ? `${label} ${safeValue}` : `${label} unavailable`;

  return (
    <div className="metric-gauge" aria-label={gaugeLabel}>
      <svg className="metric-gauge-svg" viewBox="0 0 116 120" role="img">
        <path className="metric-gauge-track" d={arcPath(cx, cy, r, start, end)} />
        {hasData && (
          <path
            className="metric-gauge-fill"
            d={arcPath(cx, cy, r, start, start + (end - start) * progress)}
            stroke={statusColor}
          />
        )}
      </svg>
      <div className="metric-gauge-value">{safeValue}</div>
    </div>
  );
}

function MetricDensityBar({ value, max, statusColor, hasData }) {
  const safeValue = hasData
    ? Math.max(0, Math.min(Number(value), max))
    : 0;
  const progress = max > 0 ? (safeValue / max) * 100 : 0;
  const label = hasData ? `${safeValue} of ${max}` : "No live data";

  return (
    <div
      className={`metric-density ${hasData ? "" : "metric-density--missing"}`.trim()}
      aria-label={label}
    >
      <div className="metric-density-track" aria-hidden="true">
        {hasData ? (
          <>
            <span
              className="metric-density-fill"
              style={{ width: `${progress}%`, backgroundColor: statusColor }}
            />
            <span
              className="metric-density-marker"
              style={{
                left: `calc(${progress}% - 5px)`,
                borderColor: statusColor,
              }}
            />
          </>
        ) : (
          <span className="metric-density-fill metric-density-fill--missing" />
        )}
      </div>
      <div
        className={`metric-density-scale ${hasData ? "" : "metric-density-scale--missing"}`.trim()}
      >
        {hasData ? (
          <>
            <span>0</span>
            <span>{max}</span>
          </>
        ) : (
          <>
            <span>No live reading</span>
            <span>\u2014</span>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  id,
  title,
  context,
  value,
  max,
  status,
  gaugeLabel,
  supportText,
  helpTitle,
  helpText,
  decimals = 0,
}) {
  const hasData = value !== null && value !== undefined && Number.isFinite(Number(value));

  return (
    <article
      className={`exposure-panel metric-card metric-card--meter ${hasData ? "" : "metric-card--no-data"}`.trim()}
      aria-labelledby={id}
    >
      <div className="metric-head exposure-panel-head">
        <h3 id={id} className="metric-label">
          {title}
        </h3>
        <div className="metric-head-side">
          <span className="metric-context">{context}</span>
          {helpText && (
            <InfoDrawer
              label={`About ${title}`}
              title={helpTitle}
              className="metric-help-drawer"
            >
              {helpText}
            </InfoDrawer>
          )}
        </div>
      </div>
      <ArcGauge
        value={value}
        max={max}
        statusColor={status.color}
        decimals={decimals}
        label={gaugeLabel}
        hasData={hasData}
      />
      <div className="metric-meter-stack">
        {hasData && status.label && (
          <span className="metric-pill" style={{ "--status-color": status.color }}>
            <span className="metric-dot" />
            <span>{status.label}</span>
          </span>
        )}
        {!hasData && (
          <span className="metric-pill metric-pill--missing">
            <span className="metric-dot" />
            <span>No live data</span>
          </span>
        )}
        <MetricDensityBar
          value={value}
          max={max}
          statusColor={status.color}
          hasData={hasData}
        />
      </div>
      <p className="metric-support">{supportText}</p>
    </article>
  );
}

export default memo(MetricCard);
