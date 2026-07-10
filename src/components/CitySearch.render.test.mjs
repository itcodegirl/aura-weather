import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { render, screen, fireEvent, cleanup, act } = await import(
  "@testing-library/react"
);
const CitySearch = (await import("./CitySearch.jsx")).default;

afterEach(() => {
  cleanup();
});

const TOKYO_SAVED = {
  lat: 35.6762,
  lon: 139.6503,
  name: "Tokyo",
  country: "Japan",
};

function noop() {}

describe("CitySearch dropdown dismissal", () => {
  test("Escape closes the dropdown and blurs the input", () => {
    const view = render(
      React.createElement(CitySearch, {
        onSelect: noop,
        savedCities: [TOKYO_SAVED],
      })
    );

    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());
    assert.equal(
      input.getAttribute("aria-expanded"),
      "true",
      "dropdown expands on focus when there are idle results"
    );

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });

    assert.equal(
      input.getAttribute("aria-expanded"),
      "false",
      "Escape collapses the dropdown"
    );
  });

  test("Tabbing out of the combobox closes the dropdown — fixes the orphan-UI state Tab used to leave behind", async () => {
    // The pointerdown click-outside handler only catches mouse / touch
    // dismissal; Tab moves focus without a pointer event. The blur
    // handler closes the dropdown when focus leaves the combobox
    // subtree entirely.
    const view = render(
      React.createElement(
        "div",
        null,
        React.createElement(CitySearch, {
          onSelect: noop,
          savedCities: [TOKYO_SAVED],
        }),
        React.createElement(
          "button",
          { type: "button", "data-testid": "outside-button" },
          "Outside"
        )
      )
    );

    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());
    assert.equal(input.getAttribute("aria-expanded"), "true");

    // Simulate Tab moving focus to the outside button. Blur fires with
    // relatedTarget = next focused element; our handler should detect
    // that the next focus is OUTSIDE containerRef and close the popup.
    const outside = view.getByTestId("outside-button");
    act(() => {
      fireEvent.blur(input, { relatedTarget: outside });
    });

    assert.equal(
      input.getAttribute("aria-expanded"),
      "false",
      "Tab-out closes the dropdown via the blur handler"
    );
  });

  test("Focus moving INSIDE the combobox container (e.g. SR virtual cursor to an option) does NOT close the dropdown", () => {
    const view = render(
      React.createElement(CitySearch, {
        onSelect: noop,
        savedCities: [TOKYO_SAVED],
      })
    );

    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());
    assert.equal(input.getAttribute("aria-expanded"), "true");

    // The saved-city option is inside the container. Simulate the
    // input losing focus to it.
    const option = view.getByRole("option", { name: /Tokyo, Saved city · Japan/ });
    act(() => {
      fireEvent.blur(input, { relatedTarget: option });
    });

    assert.equal(
      input.getAttribute("aria-expanded"),
      "true",
      "moving focus to a sibling inside the combobox subtree keeps the dropdown open"
    );
  });

  test("Blur with no relatedTarget (e.g. browser-tab change) still closes the dropdown", () => {
    const view = render(
      React.createElement(CitySearch, {
        onSelect: noop,
        savedCities: [TOKYO_SAVED],
      })
    );

    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());
    assert.equal(input.getAttribute("aria-expanded"), "true");

    act(() => {
      fireEvent.blur(input, { relatedTarget: null });
    });

    assert.equal(input.getAttribute("aria-expanded"), "false");
  });
});

describe("CitySearch keyboard navigation", () => {
  test("ArrowDown from a fresh focus highlights the first saved suggestion", () => {
    const view = render(
      React.createElement(CitySearch, {
        onSelect: noop,
        savedCities: [TOKYO_SAVED],
      })
    );
    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });

    const tokyoOption = view.getByRole("option", {
      name: /Tokyo, Saved city · Japan/,
    });
    assert.equal(tokyoOption.getAttribute("aria-selected"), "true");
  });

  test("Enter with a highlighted result selects that city via onSelect", () => {
    const selections = [];
    const view = render(
      React.createElement(CitySearch, {
        onSelect: (city) => selections.push(city),
        savedCities: [TOKYO_SAVED],
      })
    );
    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());
    act(() => fireEvent.keyDown(input, { key: "ArrowDown" }));
    act(() => fireEvent.keyDown(input, { key: "Enter" }));

    assert.equal(selections.length, 1);
    assert.equal(selections[0].name, "Tokyo");
    assert.equal(selections[0].lat, TOKYO_SAVED.lat);
  });
});

describe("CitySearch result-count announcement", () => {
  test("announces how many options are available when the listbox opens", () => {
    const view = render(
      React.createElement(CitySearch, {
        onSelect: noop,
        savedCities: [TOKYO_SAVED],
      })
    );

    const input = view.getByRole("combobox", { name: "Search for a city" });
    act(() => input.focus());

    // The visible in-dropdown status region only mounts while loading,
    // on error, or on no-results, so a successful open used to announce
    // nothing at all to a screen reader.
    const live = view.container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(live, "a polite live region is mounted");
    assert.match(live.textContent, /1 result available/);
  });

  test("stays silent when there is nothing to announce", () => {
    const view = render(
      React.createElement(CitySearch, { onSelect: noop, savedCities: [] })
    );

    const live = view.container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(live, "the live region stays mounted so updates are announced");
    assert.equal(live.textContent.trim(), "");
  });
});

// Tiny references so the imports are not flagged unused if a test branch
// above is later trimmed.
void screen;
