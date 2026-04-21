import { useEffect } from "react";

function isTypingElement(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export function useSearchShortcut(searchRef) {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return undefined;
    }

    const handleShortcut = (event) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      if (!isMetaOrCtrl || event.key.toLowerCase() !== "k") return;
      if (isTypingElement(event.target)) return;

      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [searchRef]);
}

export function usePanelPreload(loaders, options = {}) {
  const { idleTimeout = 2000, fallbackDelay = 1200 } = options;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.setTimeout !== "function"
    ) {
      return undefined;
    }

    const tasks = (Array.isArray(loaders) ? loaders : []).filter(
      (loader) => typeof loader === "function"
    );
    if (tasks.length === 0) {
      return undefined;
    }

    let cancelled = false;
    let idleId;
    let timeoutId;

    const preload = () => {
      if (cancelled) return;
      tasks.forEach((loader) => {
        void loader();
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(preload, { timeout: idleTimeout });
    } else {
      timeoutId = window.setTimeout(preload, fallbackDelay);
    }

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && idleId !== undefined) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loaders, idleTimeout, fallbackDelay]);
}
