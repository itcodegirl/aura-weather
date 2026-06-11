import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const triggerLabel = typeof label === "string" && label.trim() ? label : "More info";

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((previous) => !previous);
  }, []);

  // When the panel opens, move focus into it so screen reader users
  // hear the content immediately rather than having to navigate there
  // manually. useLayoutEffect runs synchronously after the DOM is
  // painted — the panel node exists by the time focus() is called.
  useLayoutEffect(() => {
    if (open) {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // Escape closes the panel and returns focus to the trigger so a
  // keyboard user does not lose their place. We also dismiss on any
  // pointer activity outside the drawer; the audit caught a stuck-open
  // panel after a help button was tapped and the user moved on.
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        triggerRef.current?.focus?.();
      }
    };

    const handlePointerDown = (event) => {
      const container = containerRef.current;
      if (!container) return;
      if (event.target instanceof Node && container.contains(event.target)) {
        return;
      }
      close();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className={`info-drawer ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="info-drawer-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        onClick={handleToggle}
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="info-drawer-panel"
          role="note"
          tabIndex={-1}
          aria-label={title || triggerLabel}
        >
          {title && <p className="info-drawer-title">{title}</p>}
          <p className="info-drawer-copy">{children}</p>
        </div>
      )}
    </div>
  );
}

export default memo(InfoDrawer);

