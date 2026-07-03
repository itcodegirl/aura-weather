import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/test-render-setup.mjs";

const React = (await import("react")).default;
const { cleanup, render, act } = await import("@testing-library/react");
const AtmosphereParticles = (
  await import("./AtmosphereParticles.jsx")
).default;

afterEach(() => {
  cleanup();
});

describe("AtmosphereParticles", () => {
  test("renders nothing for clear / cloud condition codes", () => {
    const { container } = render(
      React.createElement(AtmosphereParticles, { conditionCode: 0 })
    );
    assert.equal(container.querySelector(".atmosphere-particles"), null);

    cleanup();
    const overcast = render(
      React.createElement(AtmosphereParticles, { conditionCode: 3 })
    );
    assert.equal(
      overcast.container.querySelector(".atmosphere-particles"),
      null
    );
  });

  test("renders rain particles for rain / drizzle / shower codes", () => {
    const { container } = render(
      React.createElement(AtmosphereParticles, { conditionCode: 63 })
    );
    const layer = container.querySelector(".atmosphere-particles--rain");
    assert.notEqual(layer, null);
    const particles = layer.querySelectorAll(".atmosphere-particle--rain");
    assert.ok(particles.length > 0, "expected rain particles to render");
  });

  test("renders snow particles for snow / snow-shower codes", () => {
    const { container } = render(
      React.createElement(AtmosphereParticles, { conditionCode: 73 })
    );
    const layer = container.querySelector(".atmosphere-particles--snow");
    assert.notEqual(layer, null);
    const particles = layer.querySelectorAll(".atmosphere-particle--snow");
    assert.ok(particles.length > 0, "expected snow particles to render");
  });

  test("renders nothing when prefersReducedData is true even on a rain code", () => {
    const { container } = render(
      React.createElement(AtmosphereParticles, {
        conditionCode: 63,
        prefersReducedData: true,
      })
    );
    assert.equal(container.querySelector(".atmosphere-particles"), null);
  });

  test("particle layout is deterministic across renders", () => {
    // The deterministic seed prevents the rain from "shuffling" on
    // every re-render. Two fresh renders of the same condition code
    // must produce identical inline-style layouts.
    const first = render(
      React.createElement(AtmosphereParticles, { conditionCode: 65 })
    );
    const firstStyles = Array.from(
      first.container.querySelectorAll(".atmosphere-particle--rain")
    ).map((node) => node.getAttribute("style"));
    cleanup();

    const second = render(
      React.createElement(AtmosphereParticles, { conditionCode: 65 })
    );
    const secondStyles = Array.from(
      second.container.querySelectorAll(".atmosphere-particle--rain")
    ).map((node) => node.getAttribute("style"));

    assert.deepEqual(firstStyles, secondStyles);
  });

  test("pauses particle animations while the tab is hidden", () => {
    const { container } = render(
      React.createElement(AtmosphereParticles, { conditionCode: 63 })
    );
    const before = [
      ...container.querySelectorAll(".atmosphere-particle--rain"),
    ];
    assert.ok(before.length > 0, "expected rain particles to render");
    assert.equal(
      (before[0].getAttribute("style") || "").includes(
        "animation-play-state: paused"
      ),
      false,
      "particles should animate while the tab is visible"
    );

    try {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      const after = [
        ...container.querySelectorAll(".atmosphere-particle--rain"),
      ];
      assert.ok(
        (after[0].getAttribute("style") || "").includes(
          "animation-play-state: paused"
        ),
        "particles must pause their animation when the tab is hidden"
      );
    } finally {
      delete document.hidden;
    }
  });
});
