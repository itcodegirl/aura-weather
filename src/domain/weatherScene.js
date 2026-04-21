import { getWeather, gradientCss } from "./weatherCodes.js";

export function deriveWeatherScene({ weather, loading, error }) {
  const hasWeatherData = Boolean(weather);
  const showGlobalLoading = loading && !hasWeatherData;
  const isBackgroundLoading = loading && hasWeatherData;
  const showGlobalError = Boolean(error) && !hasWeatherData;
  const showRefreshError = Boolean(error) && hasWeatherData;
  const weatherInfo = hasWeatherData
    ? getWeather(weather?.current?.conditionCode)
    : getWeather(0);
  const background = gradientCss(weatherInfo.gradient);

  return {
    hasWeatherData,
    showGlobalLoading,
    isBackgroundLoading,
    showGlobalError,
    showRefreshError,
    weatherInfo,
    background,
  };
}
