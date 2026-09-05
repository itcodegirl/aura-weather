import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import "../../scripts/render-test-setup.mjs";

const React = (await import("react")).default;
const { render, cleanup } = await import("@testing-library/react");
const DataTrustFooter = (await import("./DataTrustFooter.jsx")).default;

afterEach(() => {
  cleanup();
});

const LOCATION = { lat: 41.5, lon: -87.85 };
const TRUST_META = { weatherFetchedAt: 1_700_000_000_000 };
const WEATHER = { meta: { timezone: "America/Chicago" } };

describe("DataTrustFooter", () => {
  test("renders without crashing", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: LOCATION,
        trustMeta: TRUST_META,
      })
    );
    assert.ok(container.querySelector(".data-trust-footer"), "footer rendered");
  });

  test("renders with null props without crashing", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(container.querySelector(".data-trust-footer"), "footer rendered with null props");
  });

  test("shows N for positive latitude", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: LOCATION,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("41.50°N"),
      "positive lat shows N"
    );
  });

  test("shows W for negative longitude", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: LOCATION,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("87.85°W"),
      "negative lon shows W"
    );
  });

  test("shows timezone when available", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("America/Chicago"),
      "timezone rendered"
    );
  });

  test("footer has accessible label", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: WEATHER,
        location: LOCATION,
        trustMeta: TRUST_META,
      })
    );
    const footer = container.querySelector(".data-trust-footer");
    assert.ok(footer?.getAttribute("aria-label"), "footer has aria-label");
  });

  test("shows Open-Meteo source label", () => {
    const { container } = render(
      React.createElement(DataTrustFooter, {
        weather: null,
        location: null,
        trustMeta: null,
      })
    );
    assert.ok(
      container.textContent.includes("Open-Meteo"),
      "source label rendered"
    );
  });

  /*
   * The footer carries no staleness wording of its own, so its stamp is the
   * only thing standing between a restored two-day-old snapshot and a reader
   * who assumes "updated 3:42 PM" means this afternoon.
   *
   * DataTrustFooter takes no clock prop — it subscribes to useTimeNow, which
   * reads Date.now() at mount while its bucket is dormant (afterEach's
   * cleanup unsubscribes, so every test mounts dormant). Stubbing Date.now is
   * therefore how a chosen "today" is established.
   */
  describe("the update stamp never lets a stale snapshot read as today", () => {
    const renderFooterAt = (nowMs, fetchedAt) => {
      const realNow = Date.now;
      Date.now = () => nowMs;
      try {
        return render(
          React.createElement(DataTrustFooter, {
            weather: WEATHER,
            location: LOCATION,
            trustMeta: { weatherFetchedAt: fetchedAt },
          })
        );
      } finally {
        Date.now = realNow;
      }
    };

    const NOON = new Date(2026, 8, 5, 12, 0, 0).getTime();

    test("shows the clock alone for a fetch made today", () => {
      const { container } = renderFooterAt(NOON, NOON - 90 * 60_000);
      const text = container.textContent || "";

      assert.match(text, /updated \d{1,2}:\d{2}/, "keeps the familiar stamp");
      assert.doesNotMatch(
        text,
        /Sep \d/,
        "a same-day fetch needs no date to be unambiguous"
      );
    });

    test("dates the stamp for a snapshot restored from two days ago", () => {
      const { container } = renderFooterAt(NOON, NOON - 48 * 60 * 60_000);
      const text = container.textContent || "";

      assert.match(
        text,
        /updated Sep 3, \d{1,2}:\d{2}/,
        "48h-old data must not read as this afternoon"
      );
    });

    // Midnight rollover: 23:50 yesterday is barely older than the same-day
    // case above, but it belongs to a different calendar day and a bare
    // clock would place it tonight.
    test("dates a fetch from late yesterday", () => {
      const lastNight = new Date(2026, 8, 4, 23, 50, 0).getTime();
      const { container } = renderFooterAt(NOON, lastNight);

      assert.match(container.textContent || "", /updated Sep 4, /);
    });

    // Unable to confirm "today" is not licence to imply it.
    test("dates the stamp when the clock cannot be read", () => {
      const { container } = renderFooterAt(Number.NaN, NOON);

      assert.match(container.textContent || "", /updated Sep 5, /);
    });

    test("still omits the stamp entirely when no fetch time exists", () => {
      const { container } = renderFooterAt(NOON, null);
      const text = container.textContent || "";

      assert.ok(text.includes("Open-Meteo"), "the source label survives");
      assert.doesNotMatch(text, /updated/, "no fabricated timestamp");
    });
  });
});
