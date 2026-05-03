import { memo, useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import "./InfoDrawer.css";

function InfoDrawer({
  label,
  title,
  children,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerLabel = typeof label === "string" && label.trim() ? label : "More info";

  return (
    <div className={`info-drawer ${className}`.trim()}>
      <button
        type="button"
        className="info-drawer-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        onClick={() => setOpen((previous) => !previous)}
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="info-drawer-panel" role="note">
          {title && <p className="info-drawer-title">{title}</p>}
          <p className="info-drawer-copy">{children}</p>
        </div>
      )}
    </div>
  );
}

export default memo(InfoDrawer);

