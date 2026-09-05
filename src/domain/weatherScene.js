import { UNKNOWN_WEATHER, getWeather, gradientCss } from "./weatherCodes.js";

export function deriveWeatherScene({ weather, loading, error }) {
  const hasWeatherData = Boolean(weather);
  const showGlobalLoading = loading && !hasWeatherData;
  const isBackgroundLoading = loading && hasWeatherData;
  const showGlobalError = Boolean(error) && !hasWeatherData;
  const showRefreshError = Boolean(error) && hasWeatherData;
  /*
   * With no weather at all this used to ask for code 0 -- "Clear" -- so the
   * app painted a confident sunny gradient over the state of knowing
   * nothing, and the theme colour followed it. getWeather already resolves
   * a missing code to UNKNOWN_WEATHER for exactly this reason; naming it
   * directly says the absence is deliberate (audit O-03).
   */
  const weatherInfo = hasWeatherData
    ? getWeather(weather?.current?.conditionCode)
    : UNKNOWN_WEATHER;
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
