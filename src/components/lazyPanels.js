import { lazy } from "react";

export const loadStormWatchPanel = () => import("./StormWatch");
export const loadHourlyPanel = () => import("./HourlyCard");
export const loadRainPanel = () => import("./RainCard");
export const loadAtmospherePanel = () => import("./AtmosphereBento");
// Radar carries Leaflet; it is deliberately left out of
// PRELOAD_HEAVY_PANELS so its weight never lands on the initial load and
// only its own deferred chunk fetches when the panel mounts.
export const loadRadarPanel = () => import("./radar/RadarPanel");

export const PRELOAD_HEAVY_PANELS = [loadHourlyPanel, loadStormWatchPanel];

export const StormWatchPanel = lazy(loadStormWatchPanel);
export const HourlyPanel = lazy(loadHourlyPanel);
export const RainPanel = lazy(loadRainPanel);
export const AtmospherePanel = lazy(loadAtmospherePanel);
export const RadarPanel = lazy(loadRadarPanel);
