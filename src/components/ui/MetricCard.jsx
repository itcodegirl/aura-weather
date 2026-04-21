import { memo } from "react";

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
}) {
  const safe = clamp(value, min, max);
  const span = clamp(max - min, 0.0001, Number.POSITIVE_INFINITY);
  const progress = (safe - min) / span;
  const cx = 58;
  const cy = 60;
  const r = 44;
  const start = -140;
  const end = 100;
  const safeValue = Number.isFinite(value) ? value.toFixed(decimals) : "\u2014";

  return (
    <div className="metric-gauge" aria-label={`${label} ${safeValue}`}>
      <svg className="metric-gauge-svg" viewBox="0 0 116 120" role="img">
        <path className="metric-gauge-track" d={arcPath(cx, cy, r, start, end)} />
        <path
          className="metric-gauge-fill"
          d={arcPath(cx, cy, r, start, start + (end - start) * progress)}
          stroke={statusColor}
        />
      </svg>
      <div className="metric-gauge-value">{safeValue}</div>
    </div>
  );
}

function MetricDensityBar({ value, max, statusColor }) {
  const safeValue = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(Number(value), max))
    : 0;
  const progress = max > 0 ? (safeValue / max) * 100 : 0;

  return (
    <div className="metric-density" aria-label={`${safeValue} of ${max}`}>
      <div className="metric-density-track" aria-hidden="true">
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
      </div>
      <div className="metric-density-scale">
        <span>0</span>
        <span>{max}</span>
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
  decimals = 0,
}) {
  return (
    <article className="exposure-panel metric-card metric-card--meter" aria-labelledby={id}>
      <div className="metric-head exposure-panel-head">
        <h3 id={id} className="metric-label">
          {title}
        </h3>
        <span className="metric-context">{context}</span>
      </div>
      <ArcGauge
        value={value}
        max={max}
        statusColor={status.color}
        decimals={decimals}
        label={gaugeLabel}
      />
      {status.label && (
        <span className="metric-pill" style={{ "--status-color": status.color }}>
          <span className="metric-dot" />
          <span>{status.label}</span>
        </span>
      )}
      <MetricDensityBar value={value} max={max} statusColor={status.color} />
      <p className="metric-support">{supportText}</p>
    </article>
  );
}

export default memo(MetricCard);
