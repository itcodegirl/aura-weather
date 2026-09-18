import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

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

describe("AlertsCard protective action", () => {
  /*
   * The defect this closes: the card rendered event, headline, priority and
   * expiry, and dropped the NWS `instruction` — the sentence telling the
   * reader what to do. On a tornado warning that is the most consequential
   * string in the payload.
   */
  test("renders the instruction inline, without interaction", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({
            instruction:
              "Seek shelter inside a well-built structure and stay away from\nwindows.",
          }),
        ],
        alertsStatus: "ready",
      })
    );

    const guidance = screen.getByText(/Seek shelter inside a well-built structure/);
    assert.ok(guidance);
    // Not inside a <details>: the protective action must not need a click.
    assert.equal(guidance.closest("details"), null);
  });

  test("a hard-wrapped instruction renders as one paragraph, not split mid-sentence", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({
            instruction:
              "Seek shelter inside a well-built structure and stay away from\nwindows. This storm is capable of producing damaging winds.",
          }),
        ],
        alertsStatus: "ready",
      })
    );

    const lines = container.querySelectorAll(".alerts-instruction-line");
    assert.equal(lines.length, 1);
    assert.match(lines[0].textContent, /stay away from windows\./);
  });

  test("a blank-line break in the instruction renders as separate paragraphs", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({
            instruction: "Move to an interior room.\n\nAvoid windows and doors.",
          }),
        ],
        alertsStatus: "ready",
      })
    );

    const lines = container.querySelectorAll(".alerts-instruction-line");
    assert.equal(lines.length, 2);
    assert.equal(lines[0].textContent, "Move to an interior room.");
    assert.equal(lines[1].textContent, "Avoid windows and doors.");
  });

  /*
   * Absence is silent. `instruction` is missing on 40% of live alerts but on
   * none carrying urgency Immediate, so an "unavailable" line would fire
   * almost only on low-consequence products — noise, against the app's rule
   * that a missing answer is silence rather than an apology.
   */
  test("an alert with no instruction says nothing about its absence", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ instruction: "" })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-instruction"), null);
    assert.equal(screen.queryByText(/unavailable/i), null);
    assert.equal(screen.queryByText(/not provided/i), null);
    assert.equal(screen.queryByText(/no instructions/i), null);
  });

  test("an alert whose instruction prop is missing entirely renders no guidance block", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert()],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-instruction"), null);
  });

  test("the instruction is announced as guidance, not run on from the headline", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ instruction: "Move to an interior room." })],
        alertsStatus: "ready",
      })
    );

    const cue = container.querySelector(".alerts-instruction .sr-only");
    assert.ok(cue, "expected a screen-reader cue before the guidance prose");
    assert.match(cue.textContent, /what to do/i);
  });
});

describe("AlertsCard full advisory disclosure", () => {
  /*
   * `description` was normalised and read by no component. It is rendered
   * behind a disclosure rather than inline because it runs a 548-character
   * median against the instruction's 163 — four open alerts of it would bury
   * the card.
   */
  test("renders the description inside a collapsed disclosure", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({
            description:
              "At 402 PM CDT, a severe thunderstorm was located near Elgin.",
          }),
        ],
        alertsStatus: "ready",
      })
    );

    const details = container.querySelector("details.alerts-detail");
    assert.ok(details);
    assert.equal(details.open, false);
    assert.match(details.textContent, /severe thunderstorm was located near Elgin/);
  });

  test("no disclosure renders when the description is empty", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ description: "" })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector("details.alerts-detail"), null);
  });

  test("instruction and description render as separate elements, not concatenated", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [
          makeAlert({
            instruction: "Move to an interior room.",
            description: "Radar indicated rotation near Elgin.",
          }),
        ],
        alertsStatus: "ready",
      })
    );

    const guidance = screen.getByText("Move to an interior room.");
    const detail = screen.getByText("Radar indicated rotation near Elgin.");

    assert.equal(guidance.closest("details"), null);
    assert.ok(detail.closest("details"));
  });
});

describe("AlertsCard recommended-response chip", () => {
  test("renders the approved label for a CAP response value", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ response: "Shelter" })],
        alertsStatus: "ready",
      })
    );

    assert.ok(screen.getByText("Take shelter"));
  });

  test("the chip names its dimension to assistive tech, not just the verb", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ response: "Avoid" })],
        alertsStatus: "ready",
      })
    );

    const chip = container.querySelector(".alerts-response-chip");
    assert.ok(chip);
    assert.equal(
      chip.getAttribute("aria-label"),
      "Recommended response: Avoid the area"
    );
  });

  /*
   * A chip reading "None" would spend the row's most prominent slot saying
   * nothing. Same rule the instruction follows: a missing answer is silence.
   */
  test("response None renders no chip at all", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ response: "None" })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-response"), null);
    assert.equal(screen.queryByText(/none/i), null);
  });

  test("an unrecognised response token renders no chip rather than showing it raw", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ response: "Mitigate" })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-response"), null);
    assert.equal(screen.queryByText("Mitigate"), null);
  });

  test("an alert with no response prop renders no chip", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert()],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-response"), null);
  });

  /*
   * The chip says what to do; the priority badge says how bad it is. If they
   * shared a class they would read as the same kind of value sitting in the
   * same row, which is the confusion the severity-ladder work exists to stop.
   */
  test("the chip is not a severity badge", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ response: "Shelter", priority: "critical" })],
        alertsStatus: "ready",
      })
    );

    const chip = container.querySelector(".alerts-response-chip");
    assert.ok(chip);
    assert.equal(chip.classList.contains("severity-badge"), false);
    assert.equal(chip.classList.contains("alerts-priority"), false);
  });
});

describe("AlertsCard alerted area", () => {
  test("renders areaDesc so a county advisory is distinguishable from a regional one", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ area: "Cook, IL; DuPage, IL" })],
        alertsStatus: "ready",
      })
    );

    const area = container.querySelector(".alerts-area");
    assert.ok(area);
    assert.equal(area.textContent, "Cook, IL; DuPage, IL");
  });

  test("an empty area renders no element rather than a blank line", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ area: "" })],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-area"), null);
  });

  test("an alert with no area prop renders no element", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert()],
        alertsStatus: "ready",
      })
    );

    assert.equal(container.querySelector(".alerts-area"), null);
  });
});

describe("AlertsCard hazard-end window", () => {
  /*
   * The regression at the component level. CAP `expires` is when the
   * MESSAGE must be reissued; `ends` is when the HAZARD is over. The card
   * keyed its filter on the former, so an alert whose message had expired
   * but whose weather was still hours away vanished — measured 2026-09-18,
   * 8 of 136 future-onset alerts. `endsAt` now carries `ends`, with
   * `expiresAt` as the fallback when the provider sends no `ends`.
   */
  test("keeps an alert past its message expiry while its hazard end is ahead", () => {
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: inHours(9), expiresAt: inHours(-1) })],
        alertsStatus: "ready",
      })
    );

    assert.ok(screen.getByText("Severe Thunderstorm Warning"));
  });

  test("the Until line shows the hazard end, not the message expiry", () => {
    const endsAt = inHours(9);
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt, expiresAt: inHours(-1) })],
        alertsStatus: "ready",
        timeZone: "UTC",
      })
    );

    const window = container.querySelector(".alerts-window");
    assert.ok(window);
    // Same resolved instant the filter used: the hour of `endsAt`, not the
    // already-passed expiry. Compared on the hour so the assertion does not
    // depend on the formatter's minute or zone-name spelling.
    const expectedHour = new Date(endsAt).getUTCHours();
    const shown = window.textContent;
    const shownHour = new Date(endsAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      timeZone: "UTC",
    });
    assert.match(shown, /^Until /);
    assert.ok(
      shown.includes(shownHour.replace(/\s?(AM|PM)$/i, "")) || shown.includes(String(expectedHour % 12 || 12)),
      `expected the Until line to name the hazard-end hour; got "${shown}"`
    );
  });

  test("falls back to the message expiry when the alert carries no hazard end", () => {
    // Old behaviour, preserved: with no `ends` the window is what it always was.
    render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: null, expiresAt: inHours(2) })],
        alertsStatus: "ready",
      })
    );
    assert.ok(screen.getByText("Severe Thunderstorm Warning"));

    cleanup();

    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: null, expiresAt: inHours(-1) })],
        alertsStatus: "ready",
      })
    );
    assert.equal(container.querySelector(".alerts-card"), null);
  });

  test("an alert with neither timestamp is not rendered, as before", () => {
    const { container } = render(
      React.createElement(AlertsCard, {
        alerts: [makeAlert({ endsAt: null, expiresAt: null })],
        alertsStatus: "ready",
      })
    );
    assert.equal(container.querySelector(".alerts-card"), null);
  });
});
