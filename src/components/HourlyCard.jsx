// src/components/HourlyCard.jsx
//
// Glacier hourly module — three views in one card:
//   • Temp & Rain (combo): amber temperature line + node dots over
//     intensity-coloured rain-chance bars (green when rain ≥ 50%).
//   • Precipitation: rain-chance bars with a 50% "likely" threshold line.
//   • Wind: sustained-speed bars with a translucent gust extension + cap,
//     the mph value printed on every bar, and a direction arrow per hour.
//
// All 24 hours scroll horizontally (fixed column width), any hour is
// tap-selectable (the whole column is the target), the selected hour
// persists across tabs, and the pill strip scrolls in step with the chart.
// Inline-SVG only; every reading drops to an honest "—" when missing.

import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { getWeather } from "../domain/weatherCodes";
import { convertTemp } from "../utils/temperature";
import { WIND_SPEED_CONVERSION } from "../domain/wind";
import { getZonedNow } from "../utils/dates";
import { findWindowStartIndex } from "../utils/timeSeries";
import { toFiniteNumber } from "../utils/numbers";
import "./HourlyCard.css";

// ── Layout geometry ────────────────────────────────────────────────────────
const PLOT_H = 182; // px — plot height, matches the canonical mockup
const BARMAX = 120; // px — tallest a value bar can grow
const LINE_TOP = 16; // px — top of the temperature band
const LINE_SPAN = 64; // px — vertical range the temperature line uses
const SVG_W = 1000; // viewBox width for the temperature line
const COL = 44; // px — per-hour column width (drives horizontal scroll)
const LOOKBACK = 2; // hours of recent context shown (dimmed) before "now"
const WINDOW = 24; // hours rendered

const TABS = [
  { key: "tr", label: "Temp & Rain" },
  { key: "precip", label: "Precipitation" },
  { key: "wind", label: "Wind" },
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// ── Pure helpers ───────────────────────────────────────────────────────────

function compass(deg) {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return null;
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function rainTier(p) {
  if (p === null) return "na";
  if (p >= 50) return "hi"; // rain likely
  if (p >= 30) return "mid";
  return "lo";
}

function rainWord(p) {
  if (p === null) return "no data";
  if (p >= 50) return "showers likely";
  if (p >= 30) return "scattered chance";
  if (p >= 15) return "slight chance";
  return "mostly dry";
}

function toDisplayTemp(value, unit) {
  const c = convertTemp(value, unit);
  return Number.isFinite(c) ? Math.round(c) : null;
}

// Wind is always fetched in mph (getApiWindSpeedUnit), so convert to km/h
// client-side for Celsius users — same contract the rest of the app uses.
function toDisplayWind(value, unit) {
  if (value === null) return null;
  return Math.round(unit === "C" ? value * WIND_SPEED_CONVERSION : value);
}

// Build the rendered window: a little recent context (dimmed) + "now" + the
// hours ahead, each row carrying every reading the three views need.
function buildHours(hourly, unit, timeZone) {
  if (
    !Array.isArray(hourly?.time) ||
    !Array.isArray(hourly.temperature) ||
    hourly.time.length === 0
  ) {
    return { hours: [], nowIndex: -1 };
  }

  const nowIdx = findWindowStartIndex(hourly.time, {
    now: getZonedNow(timeZone).getTime(),
    windowSize: WINDOW,
    currentSlotToleranceMs: 60 * 60 * 1000,
  });
  if (nowIdx < 0) return { hours: [], nowIndex: -1 };

  const start = Math.max(0, nowIdx - LOOKBACK);
  const nowInWindow = nowIdx - start; // position of "now" within the window

  const hours = hourly.time
    .slice(start, start + WINDOW)
    .map((t, i) => {
      const src = start + i;
      const time = new Date(t);
      if (!Number.isFinite(time.getTime())) return null;

      const h12 = time.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      }); // "7 PM"
      const ampm = h12.endsWith("AM") ? "A" : "P";
      const shortLabel = `${h12.replace(/\s?[AP]M$/, "")}${ampm}`; // "7P"

      return {
        key: String(time.getTime()),
        time,
        label: h12,
        shortLabel,
        isNow: i === nowInWindow,
        isPast: i < nowInWindow,
        temp: toDisplayTemp(toFiniteNumber(hourly.temperature[src]), unit),
        rain: toFiniteNumber(hourly.rainChance?.[src]),
        windSpeed: toDisplayWind(toFiniteNumber(hourly.windSpeed?.[src]), unit),
        windGust: toDisplayWind(toFiniteNumber(hourly.windGust?.[src]), unit),
        windDir: toFiniteNumber(hourly.windDirection?.[src]),
        code: hourly.conditionCode?.[src] ?? 0,
      };
    })
    .filter(Boolean);

  return { hours, nowIndex: hours.findIndex((h) => h.isNow) };
}

// Per-tab projections so the chart, pills, detail and aria all agree.
function metricFor(hour, tab, unit) {
  const windUnit = unit === "C" ? "km/h" : "mph";
  switch (tab) {
    case "precip":
      return {
        value: hour.rain,
        main: hour.rain === null ? "—" : `${Math.round(hour.rain)}%`,
        sub:
          hour.rain === null
            ? "—"
            : hour.rain >= 50
              ? "likely"
              : hour.rain >= 30
                ? "maybe"
                : "dry",
        aria:
          hour.rain === null
            ? "no data"
            : `${Math.round(hour.rain)}% chance of rain`,
      };
    case "wind":
      return {
        value: hour.windSpeed,
        main: hour.windSpeed === null ? "—" : `${hour.windSpeed}`,
        sub:
          hour.windSpeed === null
            ? "—"
            : `g${hour.windGust ?? "–"} ${compass(hour.windDir) ?? ""}`.trim(),
        aria:
          hour.windSpeed === null
            ? "no data"
            : `${hour.windSpeed} ${windUnit}, gusts ${hour.windGust ?? "unknown"}, from ${compass(hour.windDir) ?? "variable"}`,
      };
    default:
      return {
        value: hour.temp,
        main: hour.temp === null ? "—" : `${hour.temp}°`,
        sub: hour.rain === null ? "" : `${Math.round(hour.rain)}%`,
        aria:
          hour.temp === null
            ? "no data"
            : `${hour.temp} degrees, ${hour.rain === null ? "no" : Math.round(hour.rain)}% rain`,
      };
  }
}

function detailText(hour, tab, unit) {
  const cond = getWeather(hour.code)?.label ?? "";
  if (tab === "precip") {
    return {
      value: hour.rain === null ? "—" : `${Math.round(hour.rain)}`,
      unit: hour.rain === null ? "" : "%",
      meta: `chance of rain · ${rainWord(hour.rain)}`,
    };
  }
  if (tab === "wind") {
    const u = unit === "C" ? "km/h" : "mph";
    return {
      value: hour.windSpeed === null ? "—" : `${hour.windSpeed}`,
      unit: hour.windSpeed === null ? "" : ` ${u}`,
      meta:
        hour.windSpeed === null
          ? "not reported"
          : `gusts ${hour.windGust ?? "—"} · from ${compass(hour.windDir) ?? "variable"}`,
    };
  }
  return {
    value: hour.temp === null ? "—" : `${hour.temp}`,
    unit: hour.temp === null ? "" : "°",
    meta:
      hour.rain === null
        ? cond
        : `${Math.round(hour.rain)}% rain · ${rainWord(hour.rain)}`,
  };
}

const LEGENDS = {
  tr: [
    { type: "line", label: "Temperature" },
    { type: "bar", cls: "b-mid", label: "Rain chance" },
    { type: "bar", cls: "b-hi", label: "Likely >50%" },
  ],
  precip: [
    { type: "bar", cls: "b-mid", label: "Chance of rain" },
    { type: "bar", cls: "b-hi", label: "Likely >50%" },
    { type: "dash", label: "50% line" },
  ],
  wind: [
    { type: "bar", cls: "b-mid", label: "Wind speed" },
    { type: "bar", cls: "b-gust", label: "Gusts" },
    { type: "arrow", label: "Direction" },
  ],
};

// Largest gust (or speed) in the window — the wind bars' shared scale.
function maxGust(hours) {
  const vals = hours
    .flatMap((h) => [h.windGust, h.windSpeed])
    .filter((v) => v !== null && Number.isFinite(v));
  return vals.length ? Math.max(...vals, 1) : 1;
}

// ── Component ──────────────────────────────────────────────────────────────

function HourlyCard({ weather, unit, style, isRefreshing = false }) {
  const [tab, setTab] = useState("tr");
  const [selectedKey, setSelectedKey] = useState(null); // null = follow "now"

  const chartRef = useRef(null);
  const pillsRef = useRef(null);
  const syncing = useRef(false);

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const summaryId = `${baseId}-summary`;
  const gradId = `${baseId}-grad`.replace(/:/g, "");

  const { hours, nowIndex } = useMemo(
    () => buildHours(weather?.hourly, unit, weather?.meta?.timezone),
    [weather?.hourly, unit, weather?.meta?.timezone]
  );

  const hasUsable = hours.some(
    (h) => h.temp !== null || h.rain !== null || h.windSpeed !== null
  );

  // Keep the chart and pill strip scrolled in step (proportionally).
  useEffect(() => {
    const cs = chartRef.current;
    const ps = pillsRef.current;
    if (!cs || !ps) return undefined;
    const frac = (n) => {
      const m = n.scrollWidth - n.clientWidth;
      return m > 0 ? n.scrollLeft / m : 0;
    };
    const apply = (n, f) => {
      const m = n.scrollWidth - n.clientWidth;
      n.scrollLeft = m > 0 ? f * m : 0;
    };
    const link = (from, to) => () => {
      if (syncing.current) return;
      syncing.current = true;
      apply(to, frac(from));
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    };
    const onChart = link(cs, ps);
    const onPills = link(ps, cs);
    cs.addEventListener("scroll", onChart, { passive: true });
    ps.addEventListener("scroll", onPills, { passive: true });
    return () => {
      cs.removeEventListener("scroll", onChart);
      ps.removeEventListener("scroll", onPills);
    };
  }, [hasUsable, hours.length]);

  // ── Empty / unavailable state (trust contract) ──
  if (!hours.length || !hasUsable) {
    return (
      <section
        className="bento-chart hourly-chart glass"
        style={style}
        aria-labelledby={titleId}
        data-refreshing={isRefreshing ? "true" : undefined}
        aria-busy={isRefreshing || undefined}
      >
        <div className="chart-header">
          <h3 id={titleId} className="chart-title">
            <LineIcon size={16} aria-hidden="true" />
            <span>Hourly forecast</span>
          </h3>
        </div>
        <div className="card-empty" role="status">
          <div className="card-empty__icon">
            <LineIcon size={36} aria-hidden="true" />
          </div>
          <p className="card-empty__title">Hourly chart unavailable</p>
          <p className="card-empty__copy">
            Current conditions are still live above.
          </p>
        </div>
      </section>
    );
  }

  const n = hours.length;
  const cx = (i) => ((i + 0.5) / n) * 100; // percent across the track

  // Selected hour resolves to the user pick, else "now", else first.
  const selected =
    hours.find((h) => h.key === selectedKey) || hours[nowIndex] || hours[0];
  const tabStopKey = selected?.key ?? null;
  const selectedIndex = hours.indexOf(selected);

  // Active-tab projection for every hour.
  const cells = hours.map((h) => ({ hour: h, m: metricFor(h, tab, unit) }));
  const tabHasValues = cells.some((c) => c.m.value !== null);
  const gMax = maxGust(hours);

  // Temperature line geometry (Temp & Rain view only).
  let tempPath = "";
  const tempDots = [];
  if (tab === "tr") {
    const temps = hours.map((h) => h.temp).filter((v) => v !== null);
    const tmin = temps.length ? Math.min(...temps) : 0;
    const tmax = temps.length ? Math.max(...temps) : 1;
    const trng = tmax - tmin || 1;
    const ty = (t) => LINE_TOP + ((tmax - t) / trng) * LINE_SPAN;
    const xv = (i) => ((i + 0.5) / n) * SVG_W;
    let started = false;
    hours.forEach((h, i) => {
      if (h.temp === null) {
        started = false;
        return;
      }
      tempPath += `${started ? " L" : " M"}${xv(i).toFixed(1)},${ty(h.temp).toFixed(1)}`;
      started = true;
      tempDots.push({ key: h.key, leftPct: cx(i), topPx: ty(h.temp) });
    });
  }
  const selDot = tempDots.find((d) => d.key === selected?.key);

  const lede = (() => {
    const vals = cells.map((c) => c.m.value).filter((v) => v !== null);
    if (!vals.length) return "Hourly readings aren't available right now.";
    const lo = Math.round(Math.min(...vals));
    const hi = Math.round(Math.max(...vals));
    if (tab === "tr") {
      const peak = Math.round(Math.max(...cells.map((c) => c.hour.rain ?? 0)));
      return `Temperature ${lo}°–${hi}° with rain chance peaking at ${peak}% — green bars flag the hours rain is likely.`;
    }
    if (tab === "precip")
      return `Rain chance ranges ${lo}–${hi}%. Bars above the dashed 50% line mark when rain is likely.`;
    const u = unit === "C" ? "km/h" : "mph";
    return `Wind ${lo}–${hi} ${u} with the speed printed on every bar; arrows show the direction it blows toward.`;
  })();

  const det = detailText(selected, tab, unit);

  const onStripKeyDown = (event) => {
    const keys = cells.map((c) => c.hour.key);
    const activeKey =
      event.target instanceof HTMLElement
        ? event.target.dataset.sampleKey
        : null;
    const active = Math.max(0, keys.indexOf(activeKey));
    let next = null;
    if (event.key === "ArrowRight") next = Math.min(keys.length - 1, active + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = keys.length - 1;
    if (next === null) return;
    event.preventDefault();
    setSelectedKey(keys[next]);
    event.currentTarget
      .querySelector(`[data-sample-key="${keys[next]}"]`)
      ?.focus();
  };

  return (
    <section
      className="bento-chart hourly-chart glass"
      style={style}
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <div className="chart-header">
        <h3 id={titleId} className="chart-title">
          <LineIcon size={16} aria-hidden="true" />
          <span>Hourly forecast</span>
        </h3>
      </div>

      <div className="hourly-tabs" role="group" aria-label="Hourly view">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`hourly-tab${tab === t.key ? " is-active" : ""}`}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hourly-legend" aria-hidden="true">
        {LEGENDS[tab].map((item, i) => (
          <span className="hourly-legend-item" key={i}>
            {item.type === "line" && <span className="lg-line" />}
            {item.type === "bar" && <span className={`lg-bar ${item.cls}`} />}
            {item.type === "dash" && <span className="lg-dash" />}
            {item.type === "arrow" && <span className="lg-arrow">↑</span>}
            {item.label}
          </span>
        ))}
      </div>

      <p id={summaryId} className="sr-only">
        {lede}
      </p>

      <div className="hourly-scroll-wrap">
        <div className="hourly-scroll" ref={chartRef}>
          <div className="hourly-track" style={{ width: `${n * COL}px` }}>
            <div className="hourly-plot">
              <div className="hourly-bars">
                {cells.map(({ hour }) => {
                  const isSel = hour.key === selected?.key;
                  const colCls = `hourly-col${isSel ? " is-sel" : ""}${hour.isPast ? " is-past" : ""}`;
                  if (tab === "wind") {
                    const gustH =
                      hour.windGust !== null
                        ? Math.round((hour.windGust / gMax) * BARMAX)
                        : 0;
                    const spdH =
                      hour.windSpeed !== null
                        ? Math.round((hour.windSpeed / gMax) * BARMAX)
                        : 0;
                    return (
                      <button
                        type="button"
                        className={colCls}
                        key={hour.key}
                        aria-label={`Select ${hour.label}`}
                        onClick={() => setSelectedKey(hour.key)}
                      >
                        {hour.windSpeed !== null && (
                          <span
                            className="hourly-wval"
                            style={{ bottom: `${gustH + 5}px` }}
                          >
                            {hour.windSpeed}
                          </span>
                        )}
                        {hour.windSpeed !== null && (
                          <span
                            className="hourly-wbar"
                            style={{ height: `${gustH}px` }}
                          >
                            <span
                              className="hourly-wspd"
                              style={{ height: `${spdH}px` }}
                            />
                            <span className="hourly-wcap" />
                          </span>
                        )}
                      </button>
                    );
                  }
                  const h =
                    hour.rain !== null
                      ? Math.round((hour.rain / 100) * BARMAX)
                      : 0;
                  return (
                    <button
                      type="button"
                      className={colCls}
                      key={hour.key}
                      aria-label={`Select ${hour.label}`}
                      onClick={() => setSelectedKey(hour.key)}
                    >
                      {hour.rain !== null && (
                        <span
                          className={`hourly-bar b-${rainTier(hour.rain)}`}
                          style={{ height: `${h}px` }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {tab === "tr" && tempPath && (
                <svg
                  className="hourly-svg"
                  viewBox={`0 0 ${SVG_W} ${PLOT_H}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f3b765" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#f3b765" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={tempPath}
                    fill="none"
                    stroke="#f3b765"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}

              <div className="hourly-overlay" aria-hidden="true">
                {tab === "tr" &&
                  tempDots.map((d) => (
                    <span
                      key={d.key}
                      className={`hourly-dot${d.key === selected?.key ? " is-sel" : ""}`}
                      style={{ left: `${d.leftPct}%`, top: `${d.topPx}px` }}
                    />
                  ))}
                {tab === "tr" && selDot && selected?.temp !== null && (
                  <span
                    className="hourly-tchip"
                    style={{ left: `${cx(selectedIndex)}%`, top: `${selDot.topPx - 16}px` }}
                  >
                    {selected.temp}°
                  </span>
                )}

                {(tab === "precip" || tab === "tr") && (
                  <div
                    className="hourly-thresh"
                    style={{ bottom: `${(50 / 100) * BARMAX}px` }}
                  >
                    <span>50% · likely</span>
                  </div>
                )}

                {tab === "wind" &&
                  hours.map((h, i) =>
                    h.windDir === null ? null : (
                      <span
                        key={h.key}
                        className={`hourly-arrow${h.key === selected?.key ? " is-sel" : ""}`}
                        style={{ left: `${cx(i)}%` }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          style={{ transform: `rotate(${(h.windDir + 180) % 360}deg)` }}
                        >
                          <path
                            d="M12 3 L12 21 M12 3 L7 9 M12 3 L17 9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )
                  )}

                {nowIndex >= 0 && (
                  <div className="hourly-now" style={{ left: `${cx(nowIndex)}%` }}>
                    <span className="hourly-now-tick">Now</span>
                  </div>
                )}
              </div>
            </div>

            <div className="hourly-baseline" />
            <div className="hourly-axis">
              {hours.map((h) => (
                <span
                  className={`hourly-ax${h.key === selected?.key ? " is-sel" : ""}${h.isPast ? " is-past" : ""}${h.isNow ? " is-now" : ""}`}
                  key={h.key}
                >
                  {h.shortLabel}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="hourly-edge-fade" aria-hidden="true" />
      </div>

      {!tabHasValues && (
        <p className="hourly-empty-note" role="status">
          Not reported for this location.
        </p>
      )}

      <p className="chart-lede">{lede}</p>

      <div
        className="hourly-touch-explorer"
        role="group"
        aria-label="Hourly samples"
      >
        {selected && (
          <p className="hourly-selected-sample hourly-detail">
            <span>{selected.label}</span>
            <strong>
              {det.value}
              <small>{det.unit}</small>
            </strong>
            <span className="hourly-detail-meta">{det.meta}</span>
          </p>
        )}
        <div
          className="hourly-touch-strip"
          ref={pillsRef}
          onKeyDown={onStripKeyDown}
        >
          {cells.map(({ hour, m }) => {
            const isSel = hour.key === selected?.key;
            const isUserPick = selectedKey === hour.key;
            const cond = getWeather(hour.code)?.label ?? "Weather sample";
            return (
              <button
                key={`sample-${hour.key}`}
                type="button"
                className={`hourly-touch-sample${isSel ? " is-selected" : ""}${hour.isPast ? " is-past" : ""}${hour.isNow ? " is-now" : ""}`}
                aria-current={isUserPick ? "true" : undefined}
                aria-label={`Show ${hour.label}, ${m.aria}, ${cond}`}
                data-sample-key={hour.key}
                tabIndex={hour.key === tabStopKey ? 0 : -1}
                onClick={() => setSelectedKey(hour.key)}
              >
                <span className="ts-h">{hour.shortLabel}</span>
                <strong>{m.main}</strong>
                <span className="ts-sub">{m.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(HourlyCard);
