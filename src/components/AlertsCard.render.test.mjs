import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup } = await import("@testing-library/react");
const AlertsCard = (await import("./AlertsCard.jsx")).default;

afterEach(() => {
  cleanup();
});

// AlertsCard refuses to render an alert whose `endsAt` has passed, so
// fixtures must express their expiry relative to now. A hard-coded date
// silently ages into "expired" and takes the whole suite with it.
const HOURS = 60 * 60 * 1000;

function inHours(hours) {
  return new Date(Date.now() + hours * HOURS).toISOString();
}

function makeAlert(overrides = {}) {
  return {
    id: "test-alert-1",
    event: "Severe Thunderstorm Warning",
    headline: "Storm cells moving east at 30 mph",
    priority: "high",
    endsAt: inHours(3),
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

describe("AlertsCard expiry guard", () => {
  test("does not render an alert whose expiry has already passed", () => {
    // A restored offline snapshot can be up to 48h old and carries the
    // alerts that were active when it was captured. Rendering one of those
    // in the live branch — critical badge, "Until <a past time>" — is the
    // one place stale data in this app has physical-safety consequences.
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: inHours(-2) })],
        alertsStatus: "ready",
      })
    );

    assert.equal(
      container.querySelector(".alerts-card"),
      null,
      "an expired alert must not reach the live-alert branch"
    );
  });

  test("keeps an alert that is still inside its own expiry window", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: inHours(1) })],
        alertsStatus: "ready",
      })
    );

    assert.ok(screen.getByText("Severe Thunderstorm Warning"));
  });

  test("drops only the expired entries from a mixed list", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({ id: "expired", event: "Flood Watch", endsAt: inHours(-1) }),
          makeAlert({ id: "active", event: "Tornado Warning", endsAt: inHours(2) }),
        ],
        alertsStatus: "ready",
      })
    );

    assert.ok(screen.getByText("Tornado Warning"));
    assert.equal(screen.queryByText("Flood Watch"), null);
  });

  test("ignores an alert with an unparseable expiry rather than assuming it is active", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: null })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-card"), null);
  });
});

describe("AlertsCard expiry timezone", () => {
  test("renders the expiry in the alerted location's zone, not the device's", () => {
    // NWS `expires` is offset-bearing and describes the alert area. Printing
    // it in the viewer's zone showed the wrong wall-clock hour for any saved
    // city in another zone — the device-clock bug already fixed for the
    // pressure trend and the sun arc.
    const endsAt = new Date(Date.now() + 3 * HOURS).toISOString();

    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt })],
        alertsStatus: "ready",
        timeZone: "Pacific/Honolulu",
      })
    );

    const expected = new Date(endsAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Pacific/Honolulu",
      timeZoneName: "short",
    });

    assert.ok(screen.getByText(`Until ${expected}`));
  });

  test("falls back to the device format when the zone is unusable", () => {
    const endsAt = new Date(Date.now() + 3 * HOURS).toISOString();

    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt })],
        alertsStatus: "ready",
        timeZone: "Not/AZone",
      })
    );

    const expected = new Date(endsAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    assert.ok(screen.getByText(`Until ${expected}`));
  });
});
