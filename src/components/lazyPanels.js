import { createElement, lazy } from "react";

export const loadStormWatchPanel = () => import("./StormWatch");
export const loadHourlyPanel = () => import("./HourlyCard");
export const loadRainPanel = () => import("./RainCard");
export const loadAtmospherePanel = () => import("./AtmosphereBento");
// Radar carries Leaflet; it is deliberately left out of
// PRELOAD_HEAVY_PANELS so its weight never lands on the initial load and
// only its own deferred chunk fetches when the panel mounts.
export const loadRadarPanel = () => import("./radar/RadarPanel");

export const PRELOAD_HEAVY_PANELS = [loadHourlyPanel, loadStormWatchPanel];

// Every panel built by createRetryablePanel registers its discard hook here so
// an error boundary can clear failed imports without knowing which panel it
// wraps.
const panelImportDiscards = new Set();

/**
 * Builds a lazy panel whose failed chunk fetch can actually be retried.
 *
 * React caches a lazy component's payload on the lazy object itself, and a
 * REJECTED payload is cached exactly like a resolved one: any later mount of
 * that same lazy re-throws the stored rejection synchronously, without calling
 * the loader again. With module-level `lazy()` singletons one failed chunk
 * fetch is therefore permanent, and an error boundary that recovers by
 * remounting its subtree can never clear it.
 *
 * The panel is returned as an indirection component that reads the current
 * lazy at render time, so `discardFailedPanelImports` can swap a rejected lazy
 * for a fresh one and have the next mount pick it up and issue a genuinely new
 * `import()`. A resolved module stays cached in `loadedModule`, so the happy
 * path still fetches once no matter how many times the panel mounts.
 *
 * The swap deliberately does NOT happen in the rejection handler. React
 * re-renders a suspended subtree as soon as its thenable settles, so a lazy
 * replaced there is picked up by that automatic re-render rather than by the
 * user — a permanently broken chunk then refetches in a hot loop and the
 * boundary's fallback never appears. Discarding only on an explicit retry
 * keeps one failure to one request.
 */
export function createRetryablePanel(load) {
  let loadedModule = null;
  let pendingImport = null;
  let hasRejected = false;

  const loadOnce = () => {
    if (loadedModule) {
      return Promise.resolve(loadedModule);
    }
    if (!pendingImport) {
      pendingImport = load().then(
        (module) => {
          loadedModule = module;
          pendingImport = null;
          return module;
        },
        (error) => {
          pendingImport = null;
          hasRejected = true;
          throw error;
        }
      );
    }
    return pendingImport;
  };

  let LazyPanel = lazy(loadOnce);

  panelImportDiscards.add(() => {
    // A panel that never failed keeps its lazy — and with it any payload React
    // has already resolved — so an unrelated retry cannot remount it.
    if (!hasRejected) {
      return;
    }
    hasRejected = false;
    LazyPanel = lazy(loadOnce);
  });

  return function RetryablePanel(props) {
    return createElement(LazyPanel, props);
  };
}

/**
 * Throws away the lazy objects whose imports rejected, so the next mount of
 * those panels re-attempts the fetch. Called by the error boundaries' retry
 * handlers before they remount their subtree.
 */
export function discardFailedPanelImports() {
  for (const discard of panelImportDiscards) {
    discard();
  }
}

export const StormWatchPanel = createRetryablePanel(loadStormWatchPanel);
export const HourlyPanel = createRetryablePanel(loadHourlyPanel);
export const RainPanel = createRetryablePanel(loadRainPanel);
export const AtmospherePanel = createRetryablePanel(loadAtmospherePanel);
export const RadarPanel = createRetryablePanel(loadRadarPanel);
