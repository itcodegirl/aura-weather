import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// useWeatherData imports "../api" as a directory, which Vite resolves and
// plain Node ESM does not. The shim registers the loader that does; every
// hook test in this directory bootstraps the same way.
import "../../scripts/render-test-setup.mjs";

const { revalidateRestoredAlerts } = await import("./useWeatherData.js");

/*
 * The restore-path half of the same regression `domain/alertWindow.test.mjs`
 * covers for the render path. Both filters keyed on CAP `expires` — the
 * message-refresh deadline — and dropped alerts whose hazard had not begun.
 * They now share one helper; this proves the restore path actually calls it
 * rather than carrying a second copy that could drift again.
 *
 * Driven by the recorded fixture so the timestamps are the provider's, not
 * ours. The Beach Hazards Statement has onset 05:00, expires 05:30, ends
 * 15:00: between 05:30 and 15:00 the old rule threw it away.
 */
const recorded = JSON.parse(
  readFileSync(
    new URL("../api/__fixtures__/nws-alerts-active.recorded.json", import.meta.url),
    "utf8"
  )
);

function normalise(feature) {
  const p = feature.properties;
  return {
    id: p.id,
    event: p.event,
    endsAt: typeof p.ends === "string" ? p.ends : null,
    expiresAt: typeof p.expires === "string" ? p.expires : null,
  };
}

const beach = normalise(
  recorded.features.find((f) => f.properties.event === "Beach Hazards Statement")
);
const noEnds = normalise(
  recorded.features.find((f) => f.properties.event === "Special Weather Statement")
);

describe("revalidateRestoredAlerts — the regression", () => {
  test("keeps a restored alert after its message expiry while its hazard end is ahead", () => {
    const expired = Date.parse(beach.expiresAt);
    const ends = Date.parse(beach.endsAt);
    const midway = expired + Math.floor((ends - expired) / 2);

    const weather = { alerts: [beach], alertsStatus: "ready" };
    const result = revalidateRestoredAlerts(weather, midway);

    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].event, "Beach Hazards Statement");
    // Unchanged input returns the same object — the existing early-return
    // contract that lets React skip a state update when nothing was dropped.
    assert.equal(result, weather);
  });

  test("still drops a restored alert once its hazard end has passed", () => {
    const weather = { alerts: [beach], alertsStatus: "ready" };
    const result = revalidateRestoredAlerts(weather, Date.parse(beach.endsAt) + 1);

    assert.equal(result.alerts.length, 0);
    assert.notEqual(result, weather);
  });

  test("an alert with no ends is judged on its expiry, as before", () => {
    const expires = Date.parse(noEnds.expiresAt);
    const weather = { alerts: [noEnds], alertsStatus: "ready" };

    assert.equal(revalidateRestoredAlerts(weather, expires - 1).alerts.length, 1);
    assert.equal(revalidateRestoredAlerts(weather, expires + 1).alerts.length, 0);
  });

  test("drops only the finished entries from a mixed restored list", () => {
    const midway =
      Date.parse(beach.expiresAt) +
      Math.floor((Date.parse(beach.endsAt) - Date.parse(beach.expiresAt)) / 2);
    // The no-ends alert expires well before the beach hazard ends, so at
    // `midway` it is finished and the beach hazard is not.
    assert.ok(Date.parse(noEnds.expiresAt) < midway);

    const result = revalidateRestoredAlerts(
      { alerts: [noEnds, beach], alertsStatus: "ready" },
      midway
    );

    assert.deepEqual(
      result.alerts.map((a) => a.event),
      ["Beach Hazards Statement"]
    );
  });

  test("leaves a snapshot with no alerts untouched", () => {
    const weather = { alerts: [], alertsStatus: "ready" };
    assert.equal(revalidateRestoredAlerts(weather, 1_000), weather);
    const noField = { alertsStatus: "ready" };
    assert.equal(revalidateRestoredAlerts(noField, 1_000), noField);
  });
});
