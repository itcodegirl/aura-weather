import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const AlertsCard = (await import("./AlertsCard.jsx")).default;

afterEach(() => {
  cleanup();
});

function makeAlert(overrides = {}) {
  return {
    id: "test-alert-1",
    event: "Severe Thunderstorm Warning",
    headline: "Storm cells moving east at 30 mph",
    priority: "high",
    endsAt: "2026-04-21T20:30:00-05:00",
    ...overrides,
  };
}

describe("AlertsCard render gating (don't narrate non-events)", () => {
  test("renders nothing when there are no alerts and the feed returned ready/empty", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [],
        alertsStatus: "ready",
      })
    );
    assert.equal(
      container.querySelector(".alerts-card"),
      null,
      "calm panel must not render — the audit principle: a non-event in tense vocabulary is the wrong default"
    );
  });

  test("renders nothing when feed is idle / pending and there are no alerts", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [],
        alertsStatus: "idle",
      })
    );
    assert.equal(container.querySelector(".alerts-card"), null);
  });

  test("renders the informational state when the region is unsupported (US-only coverage)", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [],
        alertsStatus: "unsupported",
      })
    );
    assert.ok(screen.getByText("Alerts unavailable for this region"));
    assert.ok(
      screen.getByText(/NOAA \/ NWS alert coverage does not extend to this location/)
    );
  });

  test("renders the informational state when the feed is unavailable, naming the provider", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [],
        alertsStatus: "unavailable",
      })
    );
    assert.ok(screen.getByText("Could not load severe alerts"));
    // Empty-state copy explains the situation; deeper provider attribution
    // lives in the trust disclosure rather than in primary panel copy.
  });
});

describe("AlertsCard heading level", () => {
  test("renders the alert title as an h2 (it sits above the first h2 group label)", () => {
    // AlertsCard renders at the top of <main> before the first <h2> group
    // label; an <h3> title there skips a heading level (h1 -> h3) for the
    // most urgent element on the page.
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert()],
        alertsStatus: "ready",
      })
    );
    const heading = screen.getByRole("heading", { name: /Severe Alerts/ });
    assert.equal(heading.tagName, "H2");
  });
});

describe("AlertsCard priority badge a11y", () => {
  test("priority badge text content is normal-case, not all-caps", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ priority: "extreme" })],
        alertsStatus: "ready",
      })
    );
    const badge = screen.getByLabelText("Priority: extreme");
    assert.ok(badge, "badge should be reachable by its aria-label");
    assert.equal(
      badge.textContent.trim(),
      "extreme",
      "DOM text must be normal case so SR engines read it as a word, not letter-by-letter"
    );
    assert.equal(
      badge.textContent.includes("EXTREME"),
      false,
      "must not bake the uppercase into the DOM text — that's CSS's job"
    );
  });

  test("badge has aria-label tying the floating priority label to its semantic meaning", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ priority: "high" })],
        alertsStatus: "ready",
      })
    );
    const badge = screen.getByLabelText("Priority: high");
    assert.ok(badge);
  });

  test("missing-priority alert falls back to 'low' for both label and class", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ priority: undefined })],
        alertsStatus: "ready",
      })
    );
    const badge = container.querySelector(".alerts-priority");
    assert.ok(badge);
    assert.equal(badge.textContent.trim(), "low");
    assert.equal(badge.getAttribute("aria-label"), "Priority: low");
    assert.ok(
      badge.classList.contains("alerts-priority--low"),
      "fallback path uses the .alerts-priority--low style modifier"
    );
  });
});

describe("AlertsCard overflow indicator", () => {
  test("only the first four alerts render in the visible list", () => {
    const alerts = Array.from({ length: 6 }, (_, i) =>
      makeAlert({ id: `alert-${i}`, event: `Event ${i}` })
    );
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts,
        alertsStatus: "ready",
      })
    );
    const items = container.querySelectorAll(".alerts-item");
    assert.equal(items.length, 4, "visible alert list is capped at 4");
    assert.ok(
      screen.getByText(/\+ 2 more alerts not shown/),
      "overflow indicator names the remaining count"
    );
  });

  test("singular vs plural overflow copy is correct for exactly one hidden alert", () => {
    const alerts = Array.from({ length: 5 }, (_, i) =>
      makeAlert({ id: `alert-${i}`, event: `Event ${i}` })
    );
    render(
      React.createElement(AlertsCard, {
        alerts,
        alertsStatus: "ready",
      })
    );
    assert.ok(screen.getByText(/\+ 1 more alert not shown/));
  });
});
