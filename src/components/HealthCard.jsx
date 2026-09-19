import { memo, useId } from "react";
import { HeartPulse } from "lucide-react";
import {
  toFiniteNumber,
  MISSING_VALUE_PLACEHOLDER,
} from "../utils/numbers";
import { getAqiStatus, getAqiGuidance } from "../domain/exposure";
import { InfoDrawer } from "./ui";
import "./HealthCard.css";

/*
 * Air quality, broken into what it is made of.
 *
 * The Atmosphere panel already draws the overall index as a gauge. This
 * panel answers the next question — what is the number made of — using the
 * per-pollutant sub-indices Open-Meteo publishes on the EPA scale. Nothing
 * here converts a concentration into an index: that would mean carrying a
 * copy of the EPA breakpoint tables, which are revised by rule-making, and
 * a stale copy would disagree with the provider silently.
 *
 * Everything on this panel is a modelled forecast, not a monitor reading.
 * Open-Meteo's US AQI comes from CAMS model output, not from an EPA
 * reference monitor, and a panel that looks like an instrument has to say
 * so: "AQI 40" beside a gauge implies a sensor at the end of the street
 * that does not exist. The provenance line is not decoration.
 */
function HealthCard({ weather, style, isRefreshing = false }) {
  const titleId = useId();
  const airQuality = weather?.airQuality ?? null;
  const aqi = toFiniteNumber(airQuality?.aqi);
  const hasAqi = aqi !== null;
  const { label, tone } = getAqiStatus(hasAqi ? aqi : null);
  // Deliberately silent for a missing reading: an absent AQI is not a safe
  // AQI, and the domain helper returns "" rather than inventing reassurance.
  const guidance = getAqiGuidance(hasAqi ? aqi : null);
  const pollutants = Array.isArray(airQuality?.pollutants)
    ? airQuality.pollutants
    : [];
  const driverLabel = airQuality?.driver?.label ?? null;

  return (
    <section
      className="card health-card"
      style={style}
      aria-labelledby={titleId}
      data-refreshing={isRefreshing ? "true" : undefined}
      aria-busy={isRefreshing || undefined}
    >
      <header className="health-header">
        <div className="health-title-row">
          <h3 id={titleId} className="health-title">
            <HeartPulse size={16} aria-hidden="true" />
            <span>Health</span>
          </h3>
          <InfoDrawer
            label="About these readings"
            title="What these readings are"
            className="health-help-drawer"
          >
            These are modelled forecasts, not monitor readings. The index and
            every pollutant below come from a model of the atmosphere rather
            than from an air-quality monitor near you, so they describe what
            the model expects rather than what an instrument recorded. The US
            index is the highest of its pollutant sub-indices, which is why
            one pollutant is named as driving it.
          </InfoDrawer>
        </div>
        <span
          className={`severity-badge severity-badge--${tone}`}
          aria-label={hasAqi ? `Air quality: ${label}` : undefined}
        >
          {hasAqi ? label : "Reading unavailable"}
        </span>
      </header>

      {guidance ? <p className="health-guidance">{guidance}</p> : null}

      <p className="health-driver">
        {hasAqi && driverLabel
          ? `Index ${Math.round(aqi)}, driven by ${driverLabel}.`
          : hasAqi
            ? `Index ${Math.round(aqi)}.`
            : "The air-quality model did not return a reading for this location."}
      </p>

      <ul className="health-grid" aria-label="Pollutant sub-indices">
        {pollutants.map((pollutant) => {
          const value = toFiniteNumber(pollutant.value);
          const isDriver = driverLabel !== null && pollutant.label === driverLabel;
          return (
            <li
              className={`health-cell${value === null ? " health-cell--missing" : ""}`}
              key={pollutant.key}
            >
              <span className="health-cell-label">
                {pollutant.label}
                {isDriver ? (
                  <span className="health-cell-driver"> · driving</span>
                ) : null}
              </span>
              <span className="health-cell-value">
                {value === null ? MISSING_VALUE_PLACEHOLDER : Math.round(value)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="health-provenance">
        Modelled forecast, not a monitor reading · US AQI scale · Open-Meteo
      </p>
    </section>
  );
}

export default memo(HealthCard);
