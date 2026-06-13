import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDisplayCountry,
  formatLocationDisplayLabel,
} from "./locationDisplay.js";

describe("location display helpers", () => {
  test("turns official provider country names into user-friendly labels", () => {
    assert.equal(
      formatDisplayCountry("United States of America (the)"),
      "United States"
    );
    assert.equal(
      formatDisplayCountry(
        "United Kingdom of Great Britain and Northern Ireland (the)"
      ),
      "United Kingdom"
    );
  });

  test("keeps normal country names readable", () => {
    assert.equal(formatDisplayCountry("  Japan  "), "Japan");
    assert.equal(formatDisplayCountry("Netherlands (the)"), "Netherlands");
    assert.equal(formatDisplayCountry(null), "");
  });

  test("builds a compact location label", () => {
    assert.equal(
      formatLocationDisplayLabel(
        "Township of Palos",
        "United States of America (the)"
      ),
      "Township of Palos, United States"
    );
    assert.equal(formatLocationDisplayLabel("Reykjavik", ""), "Reykjavik");
  });
});
