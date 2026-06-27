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
      const isSlashShortcut =
        !isMetaOrCtrl &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "/";
      const isCommandShortcut = isMetaOrCtrl && event.key.toLowerCase() === "k";
      if (!isSlashShortcut && !isCommandShortcut) return;
      if (isTypingElement(event.target)) return;

      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [searchRef]);
}

export function usePanelPreload(loaders, options = {}) {
  const { enabled = true, idleTimeout = 2000, fallbackDelay = 1200 } = options;

  useEffect(() => {
    if (
      !enabled ||
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
  }, [loaders, enabled, idleTimeout, fallbackDelay]);
}

/**
 * Asks the browser to mark this origin's storage as persistent so the
 * saved location, saved cities, and last-known forecast survive eviction.
 *
 * iOS Safari (and Chrome under storage pressure) routinely evict a site's
 * localStorage — for an installed home-screen PWA that can wipe the user's
 * chosen location between visits, which reads as "it forgot where I am
 * every time." `navigator.storage.persist()` requests an exemption. It is
 * best-effort: the browser may grant it silently (common for installed
 * PWAs / engaged sites) or decline, and either way the app keeps working.
 * We only ask when not already persisted, and never throw on unsupported
 * engines.
 */
export function usePersistentStorage() {
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.storage ||
      typeof navigator.storage.persist !== "function" ||
      typeof navigator.storage.persisted !== "function"
    ) {
      return undefined;
    }

    let cancelled = false;

    Promise.resolve(navigator.storage.persisted())
      .then((alreadyPersistent) => {
        if (cancelled || alreadyPersistent) {
          return undefined;
        }
        return navigator.storage.persist();
      })
      .catch(() => {
        // Storage manager can reject in restricted contexts; durable
        // storage is an enhancement, so a failure is non-fatal.
      });

    return () => {
      cancelled = true;
    };
  }, []);
}
