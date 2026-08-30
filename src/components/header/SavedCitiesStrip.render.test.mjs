import { afterEach, beforeEach, describe, test } from "node:test";
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

// Identity of two DOM nodes is asserted through a boolean rather than
// assert.equal: node's failure reporting deep-inspects both operands,
// and a jsdom element drags in the whole document, so a regression
// would hang the run instead of failing it.
function describeElement(element) {
  if (!element) {
    return "nothing";
  }
  const tag = element.tagName.toLowerCase();
  const className = element.getAttribute("class");
  const label = (element.textContent || "").trim().slice(0, 40);
  return `<${tag}${className ? `.${className.replace(/\s+/g, ".")}` : ""}>${label}`;
}

describe("SavedCitiesStrip focus restoration when the undo disappears", () => {
  // A stateful host: the real parent removes the chip optimistically and
  // puts it back on restore, so focus targets appear and disappear the
  // way they do in the app rather than staying pinned by a fixed prop.
  function StatefulStrip({ initialCities }) {
    const [cities, setCities] = React.useState(initialCities);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(SavedCitiesStrip, {
        savedCities: cities,
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: (city) =>
          setCities((prev) => prev.filter((entry) => entry.name !== city.name)),
        restoreSavedCity: (city) => setCities((prev) => [...prev, city]),
      }),
      React.createElement("button", { type: "button" }, "Elsewhere")
    );
  }

  function renderStateful(initialCities) {
    return render(React.createElement(StatefulStrip, { initialCities }));
  }

  async function removeTokyo(view) {
    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });
  }

  test("activating Undo leaves focus on a real element inside the strip", async () => {
    const view = renderStateful([TOKYO, LONDON]);
    const doc = view.container.ownerDocument;

    await removeTokyo(view);
    assert.ok(
      doc.activeElement === view.getByRole("button", { name: "Undo" }),
      "precondition: the remove hand-off puts focus on Undo"
    );

    await act(async () => {
      view.getByRole("button", { name: "Undo" }).click();
    });

    assert.ok(
      doc.activeElement !== doc.body,
      "the Undo button unmounts on activation; focus must not fall to <body>"
    );
    const strip = view.container.querySelector(".saved-cities-strip");
    assert.equal(
      strip.contains(doc.activeElement),
      true,
      `focus should land inside the strip the undo restored into, got ${describeElement(doc.activeElement)}`
    );
    assert.ok(
      doc.activeElement === view.getByRole("button", { name: "Tokyo" }),
      `the restored city's own chip is the sensible target, got ${describeElement(doc.activeElement)}`
    );
  });

  test("focus is not stolen when the user moved on before activating Undo", async () => {
    const view = renderStateful([TOKYO, LONDON]);
    const doc = view.container.ownerDocument;

    await removeTokyo(view);

    const elsewhere = view.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();

    await act(async () => {
      view.getByRole("button", { name: "Undo" }).click();
    });

    assert.ok(
      doc.activeElement === elsewhere,
      `focus that has already moved out of the undo region must stay put, got ${describeElement(doc.activeElement)}`
    );
  });
});

describe("SavedCitiesStrip focus restoration when the undo times out", () => {
  // The undo window closes on a timer; the fakes let the test cross the
  // 6-second boundary without waiting for it.
  let originalSetTimeout;
  let originalClearTimeout;
  let originalWindowSetTimeout;
  let originalWindowClearTimeout;
  let pendingTimers;
  let nextTimerId;

  function installFakeTimers() {
    pendingTimers = new Map();
    nextTimerId = 1;
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    originalWindowSetTimeout = globalThis.window.setTimeout;
    originalWindowClearTimeout = globalThis.window.clearTimeout;
    const fakeSetTimeout = (handler, delay) => {
      const id = nextTimerId++;
      pendingTimers.set(id, { handler, delay });
      return id;
    };
    const fakeClearTimeout = (id) => {
      pendingTimers.delete(id);
    };
    globalThis.setTimeout = fakeSetTimeout;
    globalThis.clearTimeout = fakeClearTimeout;
    globalThis.window.setTimeout = fakeSetTimeout;
    globalThis.window.clearTimeout = fakeClearTimeout;
  }

  function flushTimersUpTo(targetMs) {
    for (const [id, { handler, delay }] of [...pendingTimers.entries()]) {
      if (delay <= targetMs) {
        pendingTimers.delete(id);
        handler();
      }
    }
  }

  function restoreTimers() {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.window.setTimeout = originalWindowSetTimeout;
    globalThis.window.clearTimeout = originalWindowClearTimeout;
  }

  beforeEach(() => {
    installFakeTimers();
  });

  afterEach(() => {
    restoreTimers();
  });

  function renderStrip(savedCities) {
    return render(
      React.createElement(SavedCitiesStrip, {
        savedCities,
        location: { lat: 0, lon: 0 },
        loadSavedCity: () => {},
        forgetSavedCity: () => {},
        restoreSavedCity: () => {},
      })
    );
  }

  test("expiry while the Undo button holds focus moves focus to a real element", async () => {
    const view = renderStrip([TOKYO, LONDON]);
    const doc = view.container.ownerDocument;

    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });
    assert.ok(
      doc.activeElement === view.getByRole("button", { name: "Undo" }),
      "precondition: the remove hand-off puts focus on Undo"
    );

    await act(async () => {
      flushTimersUpTo(6000);
    });

    assert.ok(
      view.container.querySelector(".saved-city-undo") === null,
      "precondition: the undo window closed on expiry"
    );
    assert.ok(
      doc.activeElement !== doc.body,
      "an expiring undo must not drop focus to <body> either"
    );
    assert.equal(
      view.container
        .querySelector(".saved-cities-strip")
        .contains(doc.activeElement),
      true,
      `focus should land on the strip's nearest stable control, got ${describeElement(doc.activeElement)}`
    );
  });

  test("expiry does not steal focus the user has moved elsewhere", async () => {
    const view = renderStrip([TOKYO, LONDON]);
    const doc = view.container.ownerDocument;

    await act(async () => {
      view
        .getByRole("button", { name: "Remove Tokyo from saved cities" })
        .click();
    });

    const elsewhere = view.getByRole("button", { name: "London" });
    elsewhere.focus();

    await act(async () => {
      flushTimersUpTo(6000);
    });

    assert.ok(
      doc.activeElement === elsewhere,
      `the timer must not yank focus away from wherever the user went, got ${describeElement(doc.activeElement)}`
    );
  });
});

describe("SavedCitiesStrip reorder announcement lifecycle", () => {
  test("the reorder notice clears so an identical repeat re-announces", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timers = new Map();
    let nextId = 1;
    globalThis.setTimeout = (handler, delay) => {
      const id = nextId++;
      timers.set(id, { handler, delay });
      return id;
    };
    globalThis.clearTimeout = (id) => timers.delete(id);

    try {
      const view = render(
        React.createElement(SavedCitiesStrip, {
          savedCities: [TOKYO, LONDON],
          location: { lat: 0, lon: 0 },
          loadSavedCity: () => {},
          forgetSavedCity: () => {},
          restoreSavedCity: () => {},
          moveSavedCity: () => {},
        })
      );
      const notice = view.container.querySelector(".sr-only[role='status']");

      await act(async () => {
        view
          .getByRole("button", {
            name: "Move Tokyo later in your saved cities",
          })
          .click();
      });
      assert.match(notice.textContent, /Tokyo moved to position 2 of 2/);

      await act(async () => {
        for (const [id, { handler, delay }] of [...timers.entries()]) {
          if (delay <= 1500) {
            timers.delete(id);
            handler();
          }
        }
      });
      assert.equal(
        notice.textContent,
        "",
        "a live region that keeps its text cannot announce the same message twice"
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
