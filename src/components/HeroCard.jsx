// src/components/HeroCard.jsx

import { memo } from "react";
import { MapPin, Wind, Droplets, Gauge, Thermometer } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { formatWindSpeed } from "../utils/windUnits";
import WeatherIcon from "./WeatherIcon";
import "./HeroCard.css";

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

function HeroCard({
  weather,
  location,
  unit,
  convertTemp,
  climateComparison,
  style,
}) {
  const current = weather.current;
  const info = getWeather(current.weather_code);
  const tempUnit = unit === "F" ? "\u00B0F" : "\u00B0C";
  const windDisplay = formatWindSpeed(current.wind_speed_10m, unit);
  const dewPoint = convertTemp(current.dew_point_2m);
  const hasClimateComparison =
    climateComparison && Number.isFinite(climateComparison.differenceF);
  const climateDelta = hasClimateComparison
    ? Math.abs(convertTemp(Math.abs(climateComparison.differenceF)))
    : 0;
  let climateDirection = "";
  if (hasClimateComparison) {
    if (climateComparison.differenceF > 0) climateDirection = "warmer";
    else if (climateComparison.differenceF < 0) climateDirection = "colder";
    else climateDirection = "about the same";
  }
  const climateSource = hasClimateComparison
    ? `${climateComparison.sampleYears || 30}-year`
    : "";
  const climateDate = climateComparison?.referenceDateLabel;
  const climateLocation = location?.name || "this location";
  const climateMessage = hasClimateComparison
    ? climateDirection === "about the same"
      ? `Today is about the same as the ${climateSource} average for ${climateDate} in ${climateLocation}, from the Open-Meteo historical archive.`
      : `Today is ${climateDelta}${tempUnit} ${climateDirection} than the ${climateSource} average for ${climateDate} in ${climateLocation}, from the Open-Meteo historical archive.`
    : "";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="bento-hero hero-card" style={style}>
      <header className="hero-meta">
        <div className="hero-location">
          <MapPin size={14} />
          <span>
            {location.name}
            {location.country ? `, ${location.country}` : ""}
          </span>
        </div>
        <p className="hero-date">{today}</p>
      </header>

      <div className="hero-main">
        <div className="hero-icon">
          <WeatherIcon code={current.weather_code} size={120} animated />
        </div>
        <div className="hero-temp-block">
          <div className="hero-temp">
            {convertTemp(current.temperature_2m)}
            <span className="hero-temp-unit">{tempUnit}</span>
          </div>
        <div className="hero-condition">{info.label}</div>
        <div className="hero-feels">
          Feels like {convertTemp(current.apparent_temperature)}
          {tempUnit}
        </div>
        {hasClimateComparison && (
          <p className="hero-insight">{climateMessage}</p>
        )}
      </div>
      </div>

      <div className="hero-stats">
        <Stat
          icon={<Wind size={18} />}
          label="Wind"
          value={windDisplay}
        />
        <Stat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={`${Math.round(current.relative_humidity_2m)}%`}
        />
        <Stat
          icon={<Gauge size={18} />}
          label="Pressure"
          value={`${Math.round(current.surface_pressure)} hPa`}
        />
        <Stat
          icon={<Thermometer size={18} />}
          label="Dew Point"
          value={`${dewPoint}${tempUnit}`}
        />
      </div>
    </section>
  );
}

export default memo(HeroCard);
