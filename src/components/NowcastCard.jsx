import { memo, useId, useMemo } from "react";
import { CloudRain } from "lucide-react";
import { toFiniteNumber as toStrictFiniteNumber } from "../utils/numbers";
import { analyzeNowcast } from "./nowcast/analyzeNowcast.js";
import { InfoDrawer } from "./ui";
import "./NowcastCard.css";

function NowcastCard({
  weather,
  style,
  isRefreshing = false,
}) {
  const titleId = useId();
  const nowcast = useMemo(
    () => analyzeNowcast(weather?.nowcast, { timeZone: weather?.meta?.timezone }),
    [weather?.nowcast, weather?.meta?.timezone]
  );
  const {
    nowcastRiskTone,
    nowcastRiskLabel,
    startValue,
    durationValue,
    peakValue,
  } = useMemo(() => {
    const parsedPeak = toStrictFiniteNumber(nowcast.peakProbability);
    const peakProbability = parsedPeak === null ? null : Math.round(parsedPeak);
    const riskTone = !nowcast.hasData
      ? "missing"
      : !nowcast.hasRain
      ? "minimal"
      : peakProbability === null
        ? "partial"
        : peakProbability >= 70
        ? "high"
        : peakProbability >= 40
          ? "moderate"
          : "low";
    /*
     * Risk-label voice ladder: stays in user vocabulary on every
     * branch. The previous "Nowcast offline" string treated the panel
     * as a system that could be online/offline — engineering talk.
     * "Reading unavailable" matches the trust contract used elsewhere
     * (HeroCard placeholder, AlertsCard unavailable state).
     */
    const riskLabel = !nowcast.hasData
      ? "Reading unavailable"
      : !nowcast.hasRain
      ? "Dry window"
      : peakProbability === null
        ? "Rain signal"
      : riskTone === "high"
        ? "High immediate risk"
        : riskTone === "moderate"
          ? "Moderate immediate risk"
          : "Low immediate risk";
    const start = nowcast.hasRain
      ? nowcast.startInMinutes === 0
        ? "Now"
        : `${nowcast.startInMinutes} min`
      : "\u2014";
    const duration = nowcast.hasRain
      ? `${Math.max(0, Math.round(nowcast.durationMinutes))} min`
      : nowcast.hasData
        ? "Dry 2h"
        : "\u2014";
    const peak =
      nowcast.hasData && peakProbability !== null
        ? `${peakProbability}%`
        : "\u2014";

    return {
      nowcastRiskTone: riskTone,
      nowcastRiskLabel: riskLabel,
      startValue: start,
      durationValue: duration,
      peakValue: peak,
    };
  }, [nowcast]);

  return (
    <section
      className="bento-nowcast nowcast-card glass"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="nowcast-header">
        <div className="nowcast-title-wrap">
          <div className="nowcast-title-row">
            <h3 id={titleId} className="nowcast-title">
              <CloudRain size={16} aria-hidden="true" />
              <span>Nowcast</span>
            </h3>
            <InfoDrawer
              label="About nowcast guidance"
              title="How to read nowcast"
              className="nowcast-help-drawer"
            >
              Nowcast is short-range guidance built from 15-minute weather points. It estimates start time, likely duration, and peak rain chance over the next 2 hours.
            </InfoDrawer>
          </div>
          <p className="nowcast-explainer">
            15-minute rain guidance over the next 2 hours.
          </p>
          <span className={`severity-badge severity-badge--${nowcastRiskTone}`}>
            {nowcastRiskLabel}
          </span>
        </div>
      </header>
      <div className="nowcast-primary">
        <p className="nowcast-summary">{nowcast.summary}</p>
        <p className="nowcast-details">{nowcast.details}</p>
      </div>

      <ul className="nowcast-chips" aria-label="Immediate precipitation details">
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Start</span>
          <span className="nowcast-chip-value">{startValue}</span>
        </li>
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Duration</span>
          <span className="nowcast-chip-value">{durationValue}</span>
        </li>
        <li className="nowcast-chip">
          <span className="nowcast-chip-label">Peak chance</span>
          <span className="nowcast-chip-value">{peakValue}</span>
        </li>
      </ul>
      {/*
       * The trailing meta line ("Short-range precipitation guidance" /
       * "Nowcast offline") used to render here. Both copies were
       * redundant with content the user already saw: the explainer at
       * the top says "15-minute rain guidance over the next 2 hours."
       * and the badge already announces the unavailable state. Removed.
       */}
    </section>
  );
}

export default memo(NowcastCard);
