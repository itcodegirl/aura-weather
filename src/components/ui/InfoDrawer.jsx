import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import "./InfoDrawer.css";

// Breathing room between the trigger and the panel it opens.
const PANEL_GAP = 6;

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

  /*
   * Anchor the open panel to its card.
   *
   * The panel used to sit in normal flow inside an inline-flex drawer at
   * the end of a title row, so its width widened that row and pushed the
   * panel off the right edge of the screen — measured at 320px, the radar
   * panel ended 91.8px past the viewport, and two Atmosphere tiles ended
   * 103.5px and 119.9px past it at 430px. `body { overflow-x: hidden }`
   * clipped the evidence, so it read as truncated text rather than a
   * layout bug. Width caps could not fix it: at 430px a 240px panel does
   * not fit a ~200px bento tile at all.
   *
   * The card is the right containing block — it is the widest box the
   * panel may occupy, and it is always inside the viewport. CSS pins the
   * horizontal edges to it; only the vertical offset needs measuring,
   * because the panel must open directly beneath its own trigger rather
   * than at the top of the card. `data-anchored` gates the absolute
   * positioning so that a drawer rendered outside a card (a test harness,
   * a future host) keeps the old in-flow behaviour instead of escaping to
   * the viewport.
   */
  const positionPanel = useCallback(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const card = containerRef.current?.closest(".glass");
    if (!panel || !trigger || !card) return;

    const triggerBox = trigger.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    panel.style.setProperty(
      "--info-drawer-top",
      `${Math.round(triggerBox.bottom - cardBox.top + PANEL_GAP)}px`
    );
    panel.dataset.anchored = "true";
  }, []);

  // useLayoutEffect so the panel is placed before paint — otherwise it
  // renders at its default offset for a frame and visibly jumps. Focus
  // moves into it in the same pass so screen-reader users hear the
  // content immediately rather than having to navigate there.
  useLayoutEffect(() => {
    if (!open) return undefined;

    positionPanel();
    panelRef.current?.focus({ preventScroll: true });

    if (typeof window === "undefined") return undefined;
    // A resize can move the trigger relative to its card (the bento
    // reflows at seven breakpoints), so re-measure rather than leaving
    // the panel behind.
    window.addEventListener("resize", positionPanel);
    return () => window.removeEventListener("resize", positionPanel);
  }, [open, positionPanel]);

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

