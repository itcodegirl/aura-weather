import { memo } from "react";

/*
 * Deliberately not a live region. Several of these mount on staggered
 * deferred-mount timers (WeatherDashboard / SupplementalWeatherPanels), so
 * role="status" queued a serial "Loading hourly forecast... Loading
 * precipitation radar... Loading extended weather details..." on every
 * visit for placeholders that resolve in under a second, and the aria-label
 * duplicated the visible title on top of that (name + content).
 *
 * Work-in-progress is still signalled, without interrupting: the bento
 * <main> carries aria-busy while a refresh is in flight, this placeholder
 * mirrors it through isRefreshing, and the visible title stays in the
 * reading order for anyone who navigates to it. AGENTS.md: live regions
 * stay scoped and intentional.
 */
function CardFallback({ className = "", style, title, isRefreshing }) {
  return (
    <section
      className={`${className} loading-card glass`.trim()}
      style={style}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <p className="loading-card-title">{title}</p>
    </section>
  );
}

export default memo(CardFallback);
