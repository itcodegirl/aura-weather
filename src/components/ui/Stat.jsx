import { memo } from "react";

const MISSING_VALUE_PLACEHOLDER = "—";

function isMissingValue(value) {
  return typeof value === "string" && value.trim() === MISSING_VALUE_PLACEHOLDER;
}

function Stat({
  icon,
  label,
  value,
  className = "stat",
  iconClassName = "stat-icon",
  bodyClassName = "stat-body",
  labelClassName = "stat-label",
  valueClassName = "stat-value",
  valueStyle,
  missing,
}) {
  const hasIcon = Boolean(icon);
  const isMissing = typeof missing === "boolean" ? missing : isMissingValue(value);
  const finalValueClassName = isMissing
    ? `${valueClassName} is-missing`.trim()
    : valueClassName;
  // Wraps the dash glyph with screen-reader copy that says "no data"
  // instead of the literal em-dash, so the trust contract reads
  // correctly to assistive tech as well as sighted users.
  const renderedValue = isMissing ? (
    <span aria-label="No data available">{value}</span>
  ) : (
    value
  );

  if (!hasIcon) {
    return (
      <div className={className}>
        <span className={labelClassName}>{label}</span>
        <span className={finalValueClassName} style={valueStyle}>
          {renderedValue}
        </span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={iconClassName}>{icon}</div>
      <div className={bodyClassName}>
        <div className={labelClassName}>{label}</div>
        <div className={finalValueClassName} style={valueStyle}>
          {renderedValue}
        </div>
      </div>
    </div>
  );
}

export default memo(Stat);
