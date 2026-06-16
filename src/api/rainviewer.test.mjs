import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveRadarState,
  parseWeatherMaps,
  radarTileUrlTemplate,
  readRadarOverride,
  RADAR_FRAME_KIND,
  RADAR_STATUS,
} from "./rainviewer.js";

const PAST_FRAME = { time: 1781620200, path: "/v2/radar/98522e42cb1c" };
const NOWCAST_FRAME = { time: 1781628000, path: "/v2/radar/nowcast0001" };

function payloadWith({ past = [], nowcast = [] } = {}) {
  return {
    version: "2.0",
    host: "https://tilecache.rainviewer.com",
    radar: { past, nowcast },
  };
}

describe("deriveRadarState — status mapping", () => {
  test("frames present -> 'ready'", () => {
    const state = deriveRadarState(payloadWith({ past: [PAST_FRAME] }));
    assert.equal(state.status, RADAR_STATUS.READY);
    assert.equal(state.frames.length, 1);
    assert.equal(state.host, "https://tilecache.rainviewer.com");
  });

  test("usable payload but zero frames -> 'empty'", () => {
    const state = deriveRadarState(payloadWith({ past: [], nowcast: [] }));
    assert.equal(state.status, RADAR_STATUS.EMPTY);
    assert.equal(state.frames.length, 0);
    // The host is still surfaced so the UI can distinguish "reachable but
    // empty" from "unreachable".
    assert.equal(state.host, "https://tilecache.rainviewer.com");
  });

  test("null payload -> 'error'", () => {
    const state = deriveRadarState(null);
    assert.equal(state.status, RADAR_STATUS.ERROR);
    assert.equal(state.frames.length, 0);
    assert.equal(state.host, "");
  });

  test("payload missing the tile host -> 'error'", () => {
    const state = deriveRadarState({ radar: { past: [PAST_FRAME] } });
    assert.equal(state.status, RADAR_STATUS.ERROR);
    assert.equal(state.frames.length, 0);
  });

  test("non-object payload -> 'error'", () => {
    assert.equal(deriveRadarState("nope").status, RADAR_STATUS.ERROR);
    assert.equal(deriveRadarState(42).status, RADAR_STATUS.ERROR);
  });
});

describe("parseWeatherMaps — frame tagging and hygiene", () => {
  test("tags past and nowcast frames and orders them chronologically", () => {
    const parsed = parseWeatherMaps(
      payloadWith({ past: [PAST_FRAME], nowcast: [NOWCAST_FRAME] })
    );
    assert.equal(parsed.frames.length, 2);
    assert.equal(parsed.frames[0].kind, RADAR_FRAME_KIND.PAST);
    assert.equal(parsed.frames[1].kind, RADAR_FRAME_KIND.NOWCAST);
    assert.ok(parsed.frames[0].time <= parsed.frames[1].time);
  });

  test("drops malformed frame entries instead of failing the whole list", () => {
    const parsed = parseWeatherMaps(
      payloadWith({
        past: [PAST_FRAME, { time: "bad", path: "/x" }, { path: "/y" }, null],
      })
    );
    assert.equal(parsed.frames.length, 1);
    assert.equal(parsed.frames[0].path, PAST_FRAME.path);
  });

  test("returns null for an unusable payload", () => {
    assert.equal(parseWeatherMaps(null), null);
    assert.equal(parseWeatherMaps({ radar: {} }), null); // no host
  });
});

describe("radarTileUrlTemplate", () => {
  test("builds a Universal-Blue 256 template by default", () => {
    const url = radarTileUrlTemplate(
      "https://tilecache.rainviewer.com",
      PAST_FRAME
    );
    assert.equal(
      url,
      "https://tilecache.rainviewer.com/v2/radar/98522e42cb1c/256/{z}/{x}/{y}/4/1_1.png"
    );
  });

  test("requests 512 pixels for retina", () => {
    const url = radarTileUrlTemplate(
      "https://tilecache.rainviewer.com",
      PAST_FRAME,
      { retina: true }
    );
    assert.match(url, /\/512\/\{z\}\/\{x\}\/\{y\}\/4\/1_1\.png$/);
  });

  test("returns null without a host or frame path", () => {
    assert.equal(radarTileUrlTemplate("", PAST_FRAME), null);
    assert.equal(radarTileUrlTemplate("https://h", { time: 1 }), null);
  });
});

describe("readRadarOverride", () => {
  test("recognises the supported demo overrides", () => {
    assert.equal(readRadarOverride("?radar=error"), "error");
    assert.equal(readRadarOverride("?radar=empty"), "empty");
    assert.equal(readRadarOverride("?radar=nocoverage"), "nocoverage");
  });

  test("ignores unknown or missing values", () => {
    assert.equal(readRadarOverride("?radar=bogus"), null);
    assert.equal(readRadarOverride("?city=Chicago"), null);
    assert.equal(readRadarOverride(""), null);
  });
});
