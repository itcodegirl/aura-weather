import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, screen, cleanup, fireEvent } = await import("@testing-library/react");
const InfoDrawer = (await import("./InfoDrawer.jsx")).default;

afterEach(() => {
  cleanup();
});

describe("InfoDrawer", () => {
  test("renders a closed trigger button by default", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind", title: "What wind speed means" },
        "Surface wind in mph."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(screen.queryByRole("note"), null);
  });

  test("falls back to a generic 'More info' label when label is missing", () => {
    render(
      React.createElement(
        InfoDrawer,
        {},
        "Some help text."
      )
    );

    assert.ok(screen.getByRole("button", { name: "More info" }));
  });

  test("opens the panel on click and exposes the title + body", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind", title: "What wind speed means" },
        "Sustained surface wind from the prevailing direction."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    fireEvent.click(trigger);

    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    const note = screen.getByRole("note");
    assert.ok(note);
    assert.ok(note.textContent.includes("What wind speed means"));
    assert.ok(
      note.textContent.includes("Sustained surface wind from the prevailing direction.")
    );
  });

  test("toggles closed on a second click", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind" },
        "Body."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    fireEvent.click(trigger);
    assert.ok(screen.getByRole("note"));
    fireEvent.click(trigger);
    assert.equal(screen.queryByRole("note"), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  });

  test("renders body without title when title is omitted", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind" },
        "Body only."
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "About wind" }));
    const note = screen.getByRole("note");
    assert.equal(note.querySelector(".info-drawer-title"), null);
    assert.ok(note.textContent.includes("Body only."));
  });

  test("connects aria-controls to the panel id when open", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind" },
        "Body."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    const controlsId = trigger.getAttribute("aria-controls");
    assert.ok(controlsId, "trigger exposes aria-controls");

    fireEvent.click(trigger);
    const panel = document.getElementById(controlsId);
    assert.ok(panel, "aria-controls points at the rendered panel id");
    assert.equal(panel.getAttribute("role"), "note");
  });

  test("Escape closes the open panel and returns focus to the trigger", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind" },
        "Body."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    fireEvent.click(trigger);
    assert.ok(screen.getByRole("note"), "panel is open after click");

    fireEvent.keyDown(document, { key: "Escape" });

    assert.equal(
      screen.queryByRole("note"),
      null,
      "panel closes on Escape"
    );
    assert.equal(
      trigger.getAttribute("aria-expanded"),
      "false",
      "trigger reflects the closed state"
    );
    assert.equal(
      document.activeElement,
      trigger,
      "focus returns to the trigger so keyboard users do not get stranded"
    );
  });

  test("Escape is a no-op when the panel is already closed", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind" },
        "Body."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    assert.equal(trigger.getAttribute("aria-expanded"), "false");

    // Should not throw or change focus when the listener is not active.
    fireEvent.keyDown(document, { key: "Escape" });

    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(screen.queryByRole("note"), null);
  });

  test("pointerdown outside the drawer closes the open panel", () => {
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);

    try {
      render(
        React.createElement(
          InfoDrawer,
          { label: "About wind" },
          "Body."
        )
      );

      const trigger = screen.getByRole("button", { name: "About wind" });
      fireEvent.click(trigger);
      assert.ok(screen.getByRole("note"));

      fireEvent.pointerDown(outside);

      assert.equal(
        screen.queryByRole("note"),
        null,
        "click outside closes the panel"
      );
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
    } finally {
      outside.remove();
    }
  });

  test("pointerdown inside the drawer keeps the panel open", () => {
    render(
      React.createElement(
        InfoDrawer,
        { label: "About wind", title: "What wind speed means" },
        "Body."
      )
    );

    const trigger = screen.getByRole("button", { name: "About wind" });
    fireEvent.click(trigger);
    const note = screen.getByRole("note");

    fireEvent.pointerDown(note);

    assert.ok(
      screen.queryByRole("note"),
      "panel stays open when the user clicks inside its body (e.g. to select text)"
    );
  });
});
