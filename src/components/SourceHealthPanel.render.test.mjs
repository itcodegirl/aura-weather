import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render, screen } = await import("@testing-library/react");
const SourceHealthPanel = (await import("./SourceHealthPanel.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("SourceHealthPanel", () => {
  test("labels cached forecast, missing AQI, unsupported alerts, and reduced archive data", () => {
    render(
      React.createElement(SourceHealthPanel, {
        nowMs: 1_778_086_800_000,
        trustMeta: {
          weatherFetchedAt: 1_778_083_200_000,
          forecastStatus: "cached",
          cacheStatus: "restored",
          aqiFetchedAt: null,
          aqiStatus: "unavailable",
          alertsFetchedAt: null,
          alertsStatus: "unsupported",
          climateFetchedAt: null,
          climateStatus: "disabled",
        },
      })
    );

    assert.ok(screen.getByRole("heading", { name: /data sources/i }));
    assert.ok(screen.getByText("Saved"));
    assert.ok(screen.getByText("No reading"));
    assert.ok(screen.getByText("Not covered"));
    assert.ok(screen.getByText("Reduced data"));
    assert.ok(screen.getByText("Updated 1h ago"));
  });

  test("never labels restored supplemental data as Live", () => {
    // A snapshot written after a successful supplemental merge carries
    // aqiStatus/alertsStatus "ready" plus stale fetched-at stamps. On
    // the degraded restore path those must render as Saved with their
    // honest captured-at age — a restored blob is never a live read.
    render(
      React.createElement(SourceHealthPanel, {
        nowMs: 1_778_086_800_000,
        trustMeta: {
          weatherFetchedAt: 1_777_939_200_000,
          forecastStatus: "cached",
          cacheStatus: "restored",
          cacheCapturedAt: 1_777_939_200_000,
          aqiFetchedAt: 1_777_939_200_000,
          aqiStatus: "ready",
          alertsFetchedAt: 1_777_939_200_000,
          alertsStatus: "ready",
          climateFetchedAt: null,
          climateStatus: "unavailable",
        },
      })
    );

    assert.equal(screen.queryAllByText("Live").length, 0);
    assert.equal(
      screen.getAllByText("Saved").length,
      3,
      "forecast, AQI, and alerts rows all read Saved"
    );
    assert.equal(screen.getAllByText("Updated 41h ago").length, 3);
  });

  test("renders ready providers as live with individual update times", () => {
    render(
      React.createElement(SourceHealthPanel, {
        nowMs: 1_778_083_260_000,
        trustMeta: {
          weatherFetchedAt: 1_778_083_230_000,
          forecastStatus: "ready",
          cacheStatus: "idle",
          aqiFetchedAt: 1_778_083_200_000,
          aqiStatus: "ready",
          alertsFetchedAt: 1_778_083_140_000,
          alertsStatus: "ready",
          climateFetchedAt: 1_778_083_080_000,
          climateStatus: "ready",
        },
      })
    );

    const liveLabels = screen.getAllByText("Live");
    assert.equal(liveLabels.length, 4);
    assert.ok(screen.getByText("Updated just now"));
    assert.ok(screen.getByText("Updated 1m ago"));
    assert.ok(screen.getByText("Updated 2m ago"));
    assert.ok(screen.getByText("Updated 3m ago"));
  });
  test("labels every demo row Not queried, neutral, on ?mock=missing", async () => {
    // Driven by the demo's own trustMeta rather than a hand-written
    // literal, so the row copy cannot drift away from what the route
    // actually renders.
    const { buildMissingDashboardState } = await import(
      "../mocks/missingData.js"
    );
    const { trustMeta } = buildMissingDashboardState();

    const { container } = render(
      React.createElement(SourceHealthPanel, {
        nowMs: 1_778_086_800_000,
        trustMeta,
        isMissingMock: true,
      })
    );

    assert.equal(screen.getAllByText("Not queried").length, 4);
    assert.equal(screen.queryAllByText("Issue").length, 0);
    assert.equal(
      screen.getAllByText("Not queried in this demo").length,
      4,
      "matches the radar card's wording"
    );
    // Neutral, not critical-red: nothing here failed.
    assert.equal(
      container.querySelectorAll(".source-health-item--idle").length,
      4
    );
    assert.equal(
      container.querySelectorAll(".source-health-item--unavailable").length,
      0
    );
  });

  test("keeps Issue for a real provider outage outside the demo", () => {
    // The scope guard: a live NWS outage was asked and did not answer,
    // so it must not be softened into "Not queried".
    render(
      React.createElement(SourceHealthPanel, {
        nowMs: 1_778_086_800_000,
        trustMeta: {
          weatherFetchedAt: 1_778_083_200_000,
          forecastStatus: "ready",
          cacheStatus: "idle",
          aqiFetchedAt: 1_778_083_200_000,
          aqiStatus: "ready",
          alertsFetchedAt: null,
          alertsStatus: "unavailable",
          climateFetchedAt: 1_778_083_200_000,
          climateStatus: "ready",
        },
      })
    );

    assert.ok(screen.getByText("Issue"));
    assert.ok(screen.getByText("Provider did not respond"));
    assert.equal(screen.queryAllByText("Not queried").length, 0);
  });
});
