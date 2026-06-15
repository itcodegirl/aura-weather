import { lazy } from "react";

export const loadStormWatchPanel = () => import("./StormWatch");
export const loadHourlyPanel = () => import("./HourlyCard");
export const loadRainPanel = () => import("./RainCard");
export const loadAtmospherePanel = () => import("./AtmosphereBento");

export const PRELOAD_HEAVY_PANELS = [loadHourlyPanel, loadStormWatchPanel];

export const StormWatchPanel = lazy(loadStormWatchPanel);
export const HourlyPanel = lazy(loadHourlyPanel);
export const RainPanel = lazy(loadRainPanel);
export const AtmospherePanel = lazy(loadAtmospherePanel);
