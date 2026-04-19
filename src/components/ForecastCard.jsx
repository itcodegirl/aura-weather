// src/components/ForecastCard.jsx

import { CalendarDays, Droplets } from "lucide-react";
import { getWeather } from "../utils/weatherCodes";
import { formatDayLabel } from "../utils/dates";
import WeatherIcon from "./WeatherIcon";

/**
 * Renders a single day row in the forecast.
 * Shows day name, icon, precip chance (if any), and temp range bar.
 */
function DayRow({ day, weekMin, weekMax, unit, convertTemp }) {
  const info = getWeather(day.weather_code);
  const label = formatDayLabel(day.date);
  const high = convertTemp(day.temp_max);
  const low = convertTemp(day.temp_min);
  const tempUnit = unit === "F" ? "°" : "°";

  // Calculate where this day's range sits on the week's min-max spectrum
  const weekRange = weekMax - weekMin || 1;
  const startPct = ((day.temp_min - weekMin) / weekRange) * 100;
  const endPct = ((day.temp_max - weekMin) / weekRange) * 100;

  return (
    <div className="forecast-row">
      <div className="forecast-day">{label}</div>

      <div className="forecast-icon" aria-label={info.label}>
  <WeatherIcon code={day.weather_code} size={22} />
</div>

      <div className="forecast-precip">
        {day.precipitation_probability_max >= 20 ? (
          <>
            <Droplets size={11} />
            <span>{day.precipitation_probability_max}%</span>
          </>
        ) : (
          <span className="forecast-precip-empty">—</span>
        )}
      </div>

      <div className="forecast-low">{low}{tempUnit}</div>

      <div className="forecast-range">
        <div
          className="forecast-range-bar"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(endPct - startPct, 3)}%`,
          }}
        />
      </div>

      <div className="forecast-high">{high}{tempUnit}</div>
    </div>
  );
}

export default function ForecastCard({ weather, unit, convertTemp }) {
  const daily = weather.daily;

  // Build a clean array of 7 days
  // Build a clean array, filtering out any days before today
const today = new Date();
today.setHours(0, 0, 0, 0);

const days = daily.time
  .map((date, i) => ({
    date,
    weather_code: daily.weather_code[i],
    temp_max: daily.temperature_2m_max[i],
    temp_min: daily.temperature_2m_min[i],
    precipitation_probability_max: daily.precipitation_probability_max[i] || 0,
    precipitation_sum: daily.precipitation_sum?.[i] || 0,
  }))
  .filter((day) => {
    const dayDate = new Date(day.date);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate >= today;
  })
  .slice(0, 7);

  // Week-wide min/max for range bar normalization
  const weekMin = Math.min(...days.map((d) => d.temp_min));
  const weekMax = Math.max(...days.map((d) => d.temp_max));

  return (
    <section className="bento-forecast forecast-card">
      <header className="forecast-header">
        <div className="forecast-title">
          <CalendarDays size={16} />
          <span>7-Day Forecast</span>
        </div>
        <span className="forecast-subtitle">Week ahead</span>
      </header>

      <div className="forecast-list" role="list">
        {days.map((day) => (
          <DayRow
            key={day.date}
            day={day}
            weekMin={weekMin}
            weekMax={weekMax}
            unit={unit}
            convertTemp={convertTemp}
          />
        ))}
      </div>
    </section>
  );
}