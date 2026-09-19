import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const HealthCard = (await import("./HealthCard.jsx")).default;

afterEach(() => {
  cleanup();
});

function withAirQuality(airQuality) {
  return render(React.createElement(HealthCard, { weather: { airQuality } }));
}

const FULL = {
  aqi: 42,
  driver: { key: "us_aqi_ozone", label: "Ozone" },
  pollutants: [
    { key: "us_aqi_pm2_5", label: "PM2.5", value: 31 },
    { key: "us_aqi_pm10", label: "PM10", value: 12 },
    { key: "us_aqi_ozone", label: "Ozone", value: 42 },
    { key: "us_aqi_nitrogen_dioxide", label: "NO2", value: 8 },
    { key: "us_aqi_sulphur_dioxide", label: "SO2", value: null },
    { key: "us_aqi_carbon_monoxide", label: "CO", value: 3 },
  ],
};

describe("HealthCard", () => {
  test("says it is a forecast rather than a monitor reading", () => {
    // The readings are CAMS model output. A panel drawn like an instrument
    // has to say it is not one: "AQI 42" beside a gauge otherwise implies a
    // reference monitor near the reader that does not exist.
    withAirQuality(FULL);
    assert.match(
      screen.getByText(/modelled forecast/i).textContent,
      /not a monitor reading/i
    );
  });

  test("a pollutant the model did not return reads as absent, not as zero", () => {
    withAirQuality(FULL);
    // SO2 is null in the fixture. A "0" here would say the air is clean of
    // it, which is the fabricated zero the data-trust contract forbids.
    const so2 = screen.getByText("SO2").closest("li");
    assert.equal(so2.textContent.includes("0"), false);
    assert.match(so2.textContent, /—/);
  });

  test("names the pollutant the index is made of", () => {
    withAirQuality(FULL);
    assert.match(screen.getByText(/index 42/i).textContent, /driven by Ozone/i);
  });

  test("names no driver when the provider's arithmetic does not supply one", () => {
    withAirQuality({ ...FULL, driver: null });
    const line = screen.getByText(/index 42/i).textContent;
    assert.doesNotMatch(line, /driven by/i);
  });

  test("a missing index says so instead of showing a reassuring tier", () => {
    withAirQuality({ aqi: null, driver: null, pollutants: FULL.pollutants });
    assert.ok(screen.getByText(/reading unavailable/i));
    // getAqiGuidance is deliberately silent for a missing reading: an absent
    // AQI is not a safe AQI.
    assert.equal(screen.queryByText(/no precautions needed/i), null);
  });

  test("renders without an air-quality payload at all", () => {
    render(React.createElement(HealthCard, { weather: {} }));
    assert.ok(screen.getByText(/reading unavailable/i));
    assert.ok(screen.getByText(/modelled forecast/i));
  });
});
