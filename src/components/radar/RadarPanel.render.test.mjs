import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, fireEvent, render, screen } = await import(
  "@testing-library/react"
);
const RadarPanel = (await import("./RadarPanel.jsx")).default;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const RETINA_QUERY =
  "(min-resolution: 2dppx), (-webkit-min-device-pixel-ratio: 2)";

function setRadarLoadingOverride() {
  window.history.replaceState(null, "", "/?radar=loading");
}

function renderRadarPanel(location) {
  return render(React.createElement(RadarPanel, { location }));
}

/**
 * Controllable `window.matchMedia` so a test can flip an OS-level
 * preference mid-render and drive the change listeners the component
 * subscribes to. JSDOM's own implementation is permanently "no match"
 * and never dispatches, so it cannot exercise reactivity.
 */
function installMatchMediaControl() {
  const matches = new Map();
  const listeners = new Map();
  const original = window.matchMedia;

  const listenersFor = (query) => {
    let set = listeners.get(query);
    if (!set) {
      set = new Set();
      listeners.set(query, set);
    }
    return set;
  };

  window.matchMedia = (query) => ({
    media: query,
    get matches() {
      return matches.get(query) === true;
    },
    onchange: null,
    addEventListener(_type, listener) {
      listenersFor(query).add(listener);
    },
    removeEventListener(_type, listener) {
      listenersFor(query).delete(listener);
    },
    addListener(listener) {
      listenersFor(query).add(listener);
    },
    removeListener(listener) {
      listenersFor(query).delete(listener);
    },
    dispatchEvent() {
      return false;
    },
  });

  return {
    set(query, value) {
      matches.set(query, value);
    },
    flip(query, value) {
      matches.set(query, value);
      act(() => {
        listenersFor(query).forEach((listener) =>
          listener({ matches: value, media: query })
        );
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

function weatherMapsPayload(frameTimes) {
  return {
    host: "https://tilecache.rainviewer.com",
    radar: {
      past: [
        { time: frameTimes.past, path: "/v2/radar/past-a" },
        { time: frameTimes.active, path: "/v2/radar/past-b" },
      ],
      nowcast: [{ time: frameTimes.nowcast, path: "/v2/radar/nowcast-a" }],
    },
  };
}

// Mounts the panel in its READY state: a stubbed RainViewer catalogue
// resolves on mount, so the timeline and its controls actually render.
async function renderReadyRadarPanel({ frameTimes, timeZone } = {}) {
  const times = frameTimes ?? (() => {
    const now = Math.floor(Date.now() / 1000);
    return { past: now - 600, active: now - 300, nowcast: now + 600 };
  })();

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => weatherMapsPayload(times),
  });

  let view;
  await act(async () => {
    view = render(
      React.createElement(RadarPanel, {
        location: { lat: 41.8781, lon: -87.6298, name: "Chicago" },
        timeZone,
      })
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setRadarLoadingOverride();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  globalThis.fetch = originalFetch;
});

describe("RadarPanel coordinate trust", () => {
  test("null latitude and longitude show the unavailable location state instead of (0,0)", () => {
    const view = renderRadarPanel({
      lat: null,
      lon: null,
      name: "Unknown place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.ok(screen.getByText("Pick a place to see its precipitation radar."));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("undefined latitude and longitude show the unavailable location state", () => {
    const view = renderRadarPanel({
      name: "Unknown place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("empty coordinate strings are rejected instead of coercing to (0,0)", () => {
    const view = renderRadarPanel({
      lat: "",
      lon: "   ",
      name: "Blank place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("invalid coordinate strings are rejected", () => {
    const view = renderRadarPanel({
      lat: "not-a-latitude",
      lon: "not-a-longitude",
      name: "Broken place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("NaN and Infinity coordinates are rejected", () => {
    const view = renderRadarPanel({
      lat: Number.NaN,
      lon: Number.POSITIVE_INFINITY,
      name: "Impossible place",
    });

    assert.ok(screen.getByText("Waiting for a location"));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });

  test("valid numeric coordinates still enter the radar loading state", () => {
    const view = renderRadarPanel({
      lat: 41.8781,
      lon: -87.6298,
      name: "Chicago",
    });

    assert.ok(screen.getByText(/Tuning in the latest radar/));
    assert.equal(view.container.querySelector(".radar-map-shell"), null);
  });
});

describe("RadarPanel playback under reduced motion", () => {
  let media;

  beforeEach(() => {
    // No `?radar=` override: these tests need the READY timeline.
    window.history.replaceState(null, "", "/");
    media = installMatchMediaControl();
    media.set(REDUCED_MOTION_QUERY, true);
  });

  afterEach(() => {
    media.restore();
  });

  test("the Play control is not a dead enabled button when reduced motion is set", async () => {
    await renderReadyRadarPanel();

    const play = screen.getByLabelText("Play radar animation");
    assert.equal(play.disabled, false, "expected an enabled Play control");
    assert.equal(play.getAttribute("aria-pressed"), "false");

    act(() => {
      fireEvent.click(play);
    });

    // Playback is user-initiated, so activating the control must start it.
    // The previous gate left this button enabled, focusable and inert.
    const pause = screen.getByLabelText("Pause radar animation");
    assert.equal(pause.getAttribute("aria-pressed"), "true");
    assert.equal(
      screen.queryByLabelText("Play radar animation"),
      null,
      "the control must not still read as Play after being activated"
    );

    act(() => {
      fireEvent.click(pause);
    });
    assert.equal(
      screen.getByLabelText("Play radar animation").getAttribute("aria-pressed"),
      "false"
    );
  });
});

describe("RadarPanel display-preference reactivity", () => {
  let media;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    media = installMatchMediaControl();
    media.set(RETINA_QUERY, false);
  });

  afterEach(() => {
    media.restore();
  });

  test("flipping the retina media query re-renders the panel with retina tiles", async () => {
    const view = await renderReadyRadarPanel();

    const radarTileSizes = () =>
      [...view.container.querySelectorAll("img.leaflet-tile")]
        .map((img) => img.getAttribute("src") || "")
        .filter((src) => src.includes("/v2/radar/"))
        .map((src) => src.split("/v2/radar/")[1].split("/")[1]);

    const before = radarTileSizes();
    assert.ok(before.length > 0, "expected radar tiles to render");
    assert.ok(
      before.every((size) => size === "256"),
      `expected standard-resolution radar tiles, got ${before.join(",")}`
    );

    media.flip(RETINA_QUERY, true);

    const after = radarTileSizes();
    assert.ok(after.length > 0, "expected radar tiles after the flip");
    assert.ok(
      after.every((size) => size === "512"),
      `expected retina radar tiles after the flip, got ${after.join(",")}`
    );
  });
});

describe("RadarTimeline absolute clock timezone", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  // A fixed epoch keeps the expected wall clock deterministic. Radar frame
  // times are real UTC seconds, unlike Open-Meteo's naive local strings.
  const ACTIVE_EPOCH_SECONDS = Math.floor(
    Date.UTC(2026, 2, 15, 18, 45, 0) / 1000
  );
  const frameTimes = {
    past: ACTIVE_EPOCH_SECONDS - 600,
    active: ACTIVE_EPOCH_SECONDS,
    nowcast: ACTIVE_EPOCH_SECONDS + 600,
  };

  const clockIn = (timeZone) =>
    new Date(ACTIVE_EPOCH_SECONDS * 1000).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    });

  // Pick a fixture zone whose wall clock differs from the test runner's, so
  // the assertion still fails if the timezone stops being threaded through.
  const viewerClock = clockIn(null);
  const remoteZone = [
    "Asia/Kolkata",
    "Pacific/Auckland",
    "America/Sao_Paulo",
  ].find((zone) => clockIn(zone) !== viewerClock);

  test("renders the location's wall clock, not the viewer's", async () => {
    assert.ok(remoteZone, "expected a fixture zone that differs from the runner");
    const view = await renderReadyRadarPanel({
      frameTimes,
      timeZone: remoteZone,
    });

    const clock = view.container.querySelector(".radar-readout-clock");
    assert.notEqual(clock, null, "expected the absolute clock to render");
    assert.equal(clock.textContent, clockIn(remoteZone));
    assert.notEqual(
      clock.textContent,
      viewerClock,
      "the absolute clock must not fall back to the runner's timezone"
    );
  });

  test("the slider's accessible value text carries the same zoned clock", async () => {
    const view = await renderReadyRadarPanel({
      frameTimes,
      timeZone: remoteZone,
    });

    const slider = view.container.querySelector("input.radar-slider");
    assert.notEqual(slider, null);
    const valueText = slider.getAttribute("aria-valuetext");
    assert.ok(
      valueText.endsWith(clockIn(remoteZone)),
      `expected the zoned clock in aria-valuetext, got "${valueText}"`
    );
  });

  test("falls back to the viewer's clock when no timezone is available", async () => {
    const view = await renderReadyRadarPanel({ frameTimes });

    const clock = view.container.querySelector(".radar-readout-clock");
    assert.equal(clock.textContent, viewerClock);
  });

  test("an unknown IANA zone falls back instead of throwing", async () => {
    const view = await renderReadyRadarPanel({
      frameTimes,
      timeZone: "Not/AZone",
    });

    const clock = view.container.querySelector(".radar-readout-clock");
    assert.equal(clock.textContent, viewerClock);
  });
});

describe("RadarPanel alert geometry", () => {
  beforeEach(() => {
    // No `?radar=` override: these tests need the READY map.
    window.history.replaceState(null, "", "/");
  });

  const RING = [
    [-87.9, 41.6],
    [-87.7, 41.6],
    [-87.7, 41.8],
    [-87.9, 41.8],
    [-87.9, 41.6],
  ];

  const inHours = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

  const alert = (id, geometry, overrides = {}) => ({
    id,
    event: "Severe Thunderstorm Warning",
    endsAt: inHours(3),
    geometry,
    ...overrides,
  });

  const drawable = (id) => alert(id, { type: "Polygon", coordinates: [RING] });
  const zoneIssued = (id) => alert(id, null);

  // Local mount, so the shared READY helper above keeps its exact signature.
  async function renderRadarWithAlerts(alerts) {
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => weatherMapsPayload({ past: now - 600, active: now - 300, nowcast: now + 600 }),
    });

    let view;
    await act(async () => {
      view = render(
        React.createElement(RadarPanel, {
          location: { lat: 41.8781, lon: -87.6298, name: "Chicago" },
          alerts,
        })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    return view;
  }

  test("a drawable alert paints an outline on the map", async () => {
    const { container } = await renderRadarWithAlerts([drawable("storm-1")]);

    const shapes = container.querySelectorAll("path.radar-alert-shape");
    assert.equal(shapes.length, 1);
  });

  test("the outline sits in its own pane, below the location marker", async () => {
    // Leaflet stacks vector layers by insertion order inside one pane, and
    // the marker mounts first — so ordering has to come from the pane, not
    // from JSX position. 350 is between tilePane (200) and overlayPane (400).
    const { container } = await renderRadarWithAlerts([drawable("storm-1")]);

    const shape = container.querySelector("path.radar-alert-shape");
    const pane = shape.closest(".leaflet-pane");
    assert.ok(pane, "the outline must live in a Leaflet pane");
    assert.equal(pane.style.zIndex, "350");
    assert.ok(
      Number(pane.style.zIndex) < 400,
      "the marker's overlay pane is 400 and must stay on top"
    );
  });

  test("two drawable alerts paint two outlines and say nothing", async () => {
    const { container } = await renderRadarWithAlerts([drawable("a"), drawable("b")]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 2);
    assert.equal(container.querySelector(".radar-alert-note"), null);
  });

  test("a zone-issued alert draws nothing and says why", async () => {
    const { container } = await renderRadarWithAlerts([zoneIssued("beach-1")]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 0);
    assert.equal(
      container.querySelector(".radar-alert-note").textContent,
      "County-level alert — not drawn on map"
    );
  });

  test("a mixed set draws what it can and counts what it cannot", async () => {
    const { container } = await renderRadarWithAlerts([
      drawable("storm-1"),
      zoneIssued("beach-1"),
      zoneIssued("air-1"),
    ]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 1);
    assert.equal(
      container.querySelector(".radar-alert-note").textContent,
      "2 county-level alerts — not drawn on map"
    );
  });

  test("an expired alert is neither drawn nor counted — the map and the card agree", async () => {
    // AlertsCard drops it through the same isAlertActive; a shape with no
    // row beside it would be the map asserting something the list denies.
    const expired = alert("gone", { type: "Polygon", coordinates: [RING] }, { endsAt: inHours(-1) });
    const { container } = await renderRadarWithAlerts([expired, zoneIssued("beach-1")]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 0);
    assert.equal(
      container.querySelector(".radar-alert-note").textContent,
      "County-level alert — not drawn on map"
    );
  });

  test("an alert restored from before geometry existed is neither drawn nor called county-level", async () => {
    const restored = { id: "old", event: "Flood Warning", endsAt: inHours(3) };
    assert.equal("geometry" in restored, false);

    const { container } = await renderRadarWithAlerts([restored]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 0);
    assert.equal(container.querySelector(".radar-alert-note"), null);
  });

  test("no alerts at all leaves the map exactly as it was", async () => {
    for (const value of [[], undefined, null]) {
      const { container } = await renderRadarWithAlerts(value);
      assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 0);
      assert.equal(container.querySelector(".radar-alert-note"), null);
      cleanup();
    }
  });

  test("a malformed outline is not drawn, and is counted as undrawable", async () => {
    const broken = alert("broken", { type: "Polygon", coordinates: [[[-87.9, 41.6], [null, 41.6], [-87.7, 41.8], [-87.9, 41.6]]] });
    const { container } = await renderRadarWithAlerts([broken]);

    assert.equal(container.querySelectorAll("path.radar-alert-shape").length, 0);
    assert.ok(container.querySelector(".radar-alert-note"));
  });

  test("the caption is plain text — no role, no live region", async () => {
    const { container } = await renderRadarWithAlerts([zoneIssued("beach-1")]);

    const note = container.querySelector(".radar-alert-note");
    assert.equal(note.getAttribute("role"), null);
    assert.equal(note.getAttribute("aria-live"), null);
    assert.equal(note.closest("[aria-hidden='true']"), null, "no ancestor hides the caption");
  });
});
