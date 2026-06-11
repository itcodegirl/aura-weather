import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { act, cleanup, render } = await import("@testing-library/react");
const SavedCitiesStrip = (await import("./SavedCitiesStrip.jsx")).default;

const TOKYO = {
  lat: 35.6762,
  lon: 139.6503,
  name: "Tokyo",
  country: "Japan",
};

afterEach(() => {
  cleanup();
});

describe("SavedCitiesStrip undo affordance", () => {
  test("shows an undo banner after a chip is removed", async () => {
    let forgetCalls = 0;
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {
          forgetCalls += 1;
        },
        restoreSavedCity: () => {},
      })
    );

    const removeButton = view.getByRole("button", {
      name: "Remove Tokyo from saved cities",
    });

    await act(async () => {
      removeButton.click();
    });

    assert.equal(forgetCalls, 1);
    const undoButton = view.getByRole("button", { name: "Undo" });
    assert.notEqual(undoButton, null);
    assert.match(view.container.textContent, /Removed/);
    assert.match(view.container.textContent, /Tokyo/);
  });

  test("clicking Undo restores the city via restoreSavedCity", async () => {
    const restored = [];
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: (city) => {
          restored.push(city);
        },
      })
    );

    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });

    await act(async () => {
      view.getByRole("button", { name: "Undo" }).click();
    });

    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, "Tokyo");
  });

  test("dismissing the undo banner closes it without restoring", async () => {
    const restored = [];
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: (city) => {
          restored.push(city);
        },
      })
    );

    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });

    await act(async () => {
      view.getByRole("button", { name: "Dismiss undo notice" }).click();
    });

    assert.equal(restored.length, 0);
    assert.equal(
      view.container.querySelector(".saved-city-undo"),
      null
    );
  });

  test("returns null when there are no saved cities and no pending undo", () => {
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [],
        location: null,
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );
    assert.equal(view.container.firstChild, null);
  });
});

describe("SavedCitiesStrip active-city semantic", () => {
  test("active chip uses aria-current=true rather than aria-pressed", () => {
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: TOKYO.lat, lon: TOKYO.lon, name: "Tokyo" },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );
    const chip = view.getByRole("button", { name: "Tokyo" });
    assert.equal(
      chip.getAttribute("aria-current"),
      "true",
      "active chip indicates 'currently displayed', not a toggle state"
    );
    assert.equal(
      chip.getAttribute("aria-pressed"),
      null,
      "must not use aria-pressed — that's the toggle semantic, not 'currently shown'"
    );
  });

  test("inactive chip exposes no aria-current attribute", () => {
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );
    const chip = view.getByRole("button", { name: "Tokyo" });
    assert.equal(chip.getAttribute("aria-current"), null);
    assert.equal(chip.getAttribute("aria-pressed"), null);
  });

  test("a null active location does not coerce to (0, 0) and falsely mark a chip current", () => {
    // Defends against the Number(null) === 0 pitfall — a saved city at
    // 0,0 (Null Island) would falsely match a missing active location
    // if we coerced loosely.
    const nullIsland = { lat: 0, lon: 0, name: "Null Island", country: "" };
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [nullIsland],
        location: null,
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );
    const chip = view.getByRole("button", { name: "Null Island" });
    assert.equal(chip.getAttribute("aria-current"), null);
  });
});

describe("SavedCitiesStrip focus-management after remove", () => {
  test("focus moves to the Undo button when a chip is removed", async () => {
    const view = render(
      React.createElement(SavedCitiesStrip, {
        savedCities: [TOKYO],
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );

    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });

    const undoButton = view.getByRole("button", { name: "Undo" });
    assert.equal(
      view.container.ownerDocument.activeElement,
      undoButton,
      "after removing a chip, focus lands on the Undo recovery button so keyboard / SR users can act without re-tabbing"
    );
  });
});

const LONDON = {
  lat: 51.5072,
  lon: -0.1276,
  name: "London",
  country: "United Kingdom",
};

describe("SavedCitiesStrip reordering", () => {
  function renderStrip({ savedCities, moveSavedCity }) {
    return render(
      React.createElement(SavedCitiesStrip, {
        savedCities,
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
        moveSavedCity,
      })
    );
  }

  test("hides move controls when only one city is saved", () => {
    const view = renderStrip({ savedCities: [TOKYO], moveSavedCity: () => {} });

    assert.equal(
      view.queryByRole("button", {
        name: "Move Tokyo later in your saved cities",
      }),
      null,
      "a single chip has nowhere to move, so the arrows should not render"
    );
  });

  test("clicking a move arrow reports the city and direction", async () => {
    const moves = [];
    const view = renderStrip({
      savedCities: [TOKYO, LONDON],
      moveSavedCity: (city, offset) => {
        moves.push([city.name, offset]);
      },
    });

    await act(async () => {
      view
        .getByRole("button", { name: "Move Tokyo later in your saved cities" })
        .click();
    });

    assert.deepEqual(moves, [["Tokyo", 1]]);
    assert.match(
      view.getByRole("status", { name: "" }).textContent ||
        view.container.ownerDocument.body.textContent,
      /Tokyo moved to position 2 of 2/,
      "the reorder should be announced for assistive tech"
    );
  });

  test("bound moves no-op via aria-disabled instead of dropping focus with disabled", async () => {
    const moves = [];
    const view = renderStrip({
      savedCities: [TOKYO, LONDON],
      moveSavedCity: (city, offset) => {
        moves.push([city.name, offset]);
      },
    });

    const moveEarlier = view.getByRole("button", {
      name: "Move Tokyo earlier in your saved cities",
    });
    assert.equal(
      moveEarlier.getAttribute("aria-disabled"),
      "true",
      "the first chip's move-earlier arrow should advertise aria-disabled"
    );
    assert.equal(
      moveEarlier.hasAttribute("disabled"),
      false,
      "the native disabled attribute would eject keyboard focus to <body> when a chip reaches an end slot"
    );

    await act(async () => {
      moveEarlier.click();
    });
    assert.deepEqual(moves, [], "out-of-range moves must not fire the callback");
  });
});
