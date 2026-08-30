import { memo, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  formatLastUpdatedLabel,
  formatTimestampTitle,
  getAgeMinutes,
} from "../../utils/dataTrust";
import { toFiniteNumber } from "../../utils/numbers";
import { useTimeNow } from "../../hooks/useTimeNow";
import "./GlobalUpdateIndicator.css";

const STALE_AFTER_MINUTES = 25;

/*
 * One pill that replaces the eight per-card DataTrustMeta lines that
 * used to clutter every section. Shows the freshest weatherFetchedAt
 * (or the cache-restored timestamp when the live request failed) plus
 * a single status dot. The pill is also a manual refresh button —
 * tapping it re-fetches the current location's forecast.
 */
// Empty-state placeholder so the slot's height is always present in
// the layout. Without it the indicator "pops in" when the first
// fetch lands and shoves the bento down by ~36px — a measurable CLS.
function IndicatorPlaceholder() {
  return (
    <span
      className="global-update-indicator global-update-indicator--placeholder"
      aria-hidden="true"
    />
  );
}

function GlobalUpdateIndicator({ trustMeta, onRefresh, isRefreshing }) {
  // Subscribe to the shared minute ticker directly so the parent
  // does not have to thread nowMs through; only this leaf re-renders
  // when the "Updated Nm ago" label changes.
  const nowMs = useTimeNow();

  /*
   * Refresh-complete announcement. The button broadcasts aria-busy
   * while a refresh is in flight, but a screen-reader user used to
   * hear the start with no matching end — it just went silent. We
   * watch the isRefreshing transition true → false and, when the
   * fetched-at timestamp changed across that transition (proving
   * fresh data actually arrived), we drop a polite live-region
   * message. No announcement on initial mount; no announcement when
   * a refresh failed and the timestamp is unchanged.
   */
  const [announcement, setAnnouncement] = useState("");
  const previousRefreshingRef = useRef(Boolean(isRefreshing));
  const previousFetchedAtRef = useRef(trustMeta?.weatherFetchedAt ?? null);

  useEffect(() => {
    const wasRefreshing = previousRefreshingRef.current;
    const nextFetchedAt = trustMeta?.weatherFetchedAt ?? null;
    const previousFetchedAt = previousFetchedAtRef.current;
    const justFinishedRefresh = wasRefreshing && !isRefreshing;
    const fetchedAtChanged =
      nextFetchedAt !== null && nextFetchedAt !== previousFetchedAt;

    if (justFinishedRefresh && fetchedAtChanged) {
      setAnnouncement("Forecast updated.");
      const timeoutId = setTimeout(() => setAnnouncement(""), 4000);
      previousRefreshingRef.current = isRefreshing;
      previousFetchedAtRef.current = nextFetchedAt;
      return () => clearTimeout(timeoutId);
    }

    previousRefreshingRef.current = isRefreshing;
    previousFetchedAtRef.current = nextFetchedAt;
    return undefined;
  }, [isRefreshing, trustMeta?.weatherFetchedAt]);

  if (!trustMeta) {
    return <IndicatorPlaceholder />;
  }

  const cacheStatus = trustMeta.cacheStatus ?? "idle";
  const isCached = cacheStatus === "restored";
  const lastUpdatedAt = isCached
    ? toFiniteNumber(trustMeta.cacheCapturedAt) ?? trustMeta.weatherFetchedAt
    : trustMeta.weatherFetchedAt;

  const parsedNowMs = toFiniteNumber(nowMs);
  const effectiveNowMs =
    parsedNowMs !== null ? parsedNowMs : toFiniteNumber(lastUpdatedAt);
  const ageMinutes = getAgeMinutes(lastUpdatedAt, effectiveNowMs);
  const isStale =
    Number.isFinite(ageMinutes) && ageMinutes >= STALE_AFTER_MINUTES;

  if (toFiniteNumber(lastUpdatedAt) === null) {
    return <IndicatorPlaceholder />;
  }

  const updatedLabel = formatLastUpdatedLabel(lastUpdatedAt, effectiveNowMs);
  const title = formatTimestampTitle(lastUpdatedAt);
  const stateLabel = isCached ? "saved" : isStale ? "stale" : "live";
  // Sentence-cased form of the one classification above, so the spoken
  // state can never drift from the visible chip.
  const stateName = `${stateLabel[0].toUpperCase()}${stateLabel.slice(1)}`;

  const isClickable = typeof onRefresh === "function";

  /*
   * The announcement region lives next to the indicator so the same
   * subtree owns both the visual freshness pill and the screen-reader
   * announcement. Visually hidden via .sr-only; announces politely so
   * it doesn't interrupt anything the user is reading.
   */
  const announcementRegion = (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );

  if (!isClickable) {
    return (
      <>
        <p
          className={`global-update-indicator global-update-indicator--${stateLabel}`}
          title={title}
        >
          <span className="global-update-dot" aria-hidden="true" />
          <span className="global-update-text">{updatedLabel}</span>
          <span className="global-update-state">{stateLabel}</span>
        </p>
        {announcementRegion}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`global-update-indicator global-update-indicator--${stateLabel} global-update-indicator--button`}
        title={`${title}. Tap to refresh.`}
        /*
         * `aria-label` on a button replaces its subtree for name
         * computation, so a label of only the age and the action
         * dropped the visible state word — the one token that tells a
         * screen-reader user the forecast is a saved (or stale) one.
         * State leads the name so it is heard before the age.
         */
        aria-label={`${stateName} forecast. ${updatedLabel}. Tap to refresh weather.`}
        aria-busy={isRefreshing || undefined}
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <span className="global-update-dot" aria-hidden="true" />
        <span className="global-update-text">{updatedLabel}</span>
        <span className="global-update-state">{stateLabel}</span>
        <RefreshCw
          size={12}
          className={`global-update-refresh${isRefreshing ? " is-spinning" : ""}`}
          aria-hidden="true"
        />
      </button>
      {announcementRegion}
    </>
  );
}

export default memo(GlobalUpdateIndicator);
