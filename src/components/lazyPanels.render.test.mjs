import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { lazy, Suspense } = await import("react");
const { act, cleanup, render } = await import("@testing-library/react");
const PanelErrorBoundary = (await import("./PanelErrorBoundary.jsx")).default;
const { createRetryablePanel } = await import("./lazyPanels.js");

let originalConsoleError;

function LoadedPanel() {
  return React.createElement("p", { "data-testid": "panel" }, "Loaded");
}

// A stand-in for `() => import("./SomePanel")` whose first `failures` calls
// reject, as a dropped chunk fetch does.
function makeFlakyLoader(counter, failures) {
  return () => {
    counter.attempts += 1;
    if (counter.attempts <= failures) {
      return Promise.reject(new Error("chunk load failed"));
    }
    return Promise.resolve({ default: LoadedPanel });
  };
}

function mountUnderBoundary(Panel) {
  return render(
    React.createElement(
      PanelErrorBoundary,
      { label: "Extended weather details" },
      React.createElement(
        Suspense,
        { fallback: React.createElement("p", null, "Loading...") },
        React.createElement(Panel)
      )
    )
  );
}

async function settle(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
}

function silenceBoundaryLogging() {
  originalConsoleError = console.error;
  console.error = () => {};
}

afterEach(() => {
  cleanup();
  if (originalConsoleError) {
    console.error = originalConsoleError;
    originalConsoleError = undefined;
  }
});

describe("createRetryablePanel", () => {
  test("a plain lazy() singleton cannot recover — the defect this exists to fix", async () => {
    // React caches the rejected payload on the lazy object, so remounting it
    // re-throws without calling the loader again. Pinned here because the fix
    // below is only meaningful while this stays true.
    silenceBoundaryLogging();
    const counter = { attempts: 0 };
    const view = mountUnderBoundary(lazy(makeFlakyLoader(counter, 1)));
    await settle();

    assert.match(
      view.container.textContent,
      /Extended weather details is unavailable/
    );

    await act(async () => {
      view.getByRole("button", { name: "Try again" }).click();
    });
    await settle();

    assert.equal(view.queryByTestId("panel"), null);
    assert.equal(counter.attempts, 1, "the loader was never called a second time");
  });

  test("Try again re-attempts the import and a now-healthy chunk renders", async () => {
    silenceBoundaryLogging();
    const counter = { attempts: 0 };
    const view = mountUnderBoundary(
      createRetryablePanel(makeFlakyLoader(counter, 1))
    );
    await settle();

    assert.match(
      view.container.textContent,
      /Extended weather details is unavailable/
    );

    await act(async () => {
      view.getByRole("button", { name: "Try again" }).click();
    });
    await settle();

    const panel = view.queryByTestId("panel");
    assert.notEqual(panel, null, "the panel recovered after the retry");
    assert.equal(panel.textContent, "Loaded");
    assert.equal(counter.attempts, 2, "the retry issued a real second import");
  });

  test("a permanently broken chunk refetches once per retry, not in a loop", async () => {
    // Replacing the rejected lazy eagerly would let React's own post-rejection
    // re-render pick it up and refetch forever, and the fallback would never
    // appear. One failure must cost exactly one request.
    silenceBoundaryLogging();
    const counter = { attempts: 0 };
    const view = mountUnderBoundary(
      createRetryablePanel(makeFlakyLoader(counter, Number.POSITIVE_INFINITY))
    );
    await settle(8);

    assert.equal(counter.attempts, 1);
    assert.match(
      view.container.textContent,
      /Extended weather details is unavailable/
    );

    await act(async () => {
      view.getByRole("button", { name: "Try again" }).click();
    });
    await settle(8);

    assert.equal(counter.attempts, 2);
    assert.match(
      view.container.textContent,
      /Extended weather details is unavailable/
    );
  });

  test("a resolved chunk is still imported once no matter how many mounts", async () => {
    let attempts = 0;
    const Panel = createRetryablePanel(() => {
      attempts += 1;
      return Promise.resolve({ default: LoadedPanel });
    });

    for (let i = 0; i < 3; i += 1) {
      const view = render(
        React.createElement(
          Suspense,
          { fallback: React.createElement("p", null, "Loading...") },
          React.createElement(Panel)
        )
      );
      await settle(2);
      assert.notEqual(view.queryByTestId("panel"), null);
      cleanup();
    }

    assert.equal(attempts, 1, "happy-path caching is untouched");
  });
});
