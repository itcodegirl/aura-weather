/**
 * CAP `response` — the recommended action, as a single structured value.
 *
 * NWS ships this alongside the prose `instruction`, and the two are not
 * redundant. `instruction` is several sentences of guidance and is absent on
 * roughly 40% of active alerts; `response` is one enumerated token and was
 * present on every one of the 205 features sampled on 2026-09-17. So the
 * chip built from this is the one part of "what should I do" that survives a
 * payload with no instruction text at all.
 *
 * The labels are not ours to pick. They were signed off by Jenna Zawaski on
 * 2026-09-18 and are recorded in the remediation plan's §16 status section;
 * `AGENTS.md` reserves user-facing vocabulary decisions for a human, so this
 * module transcribes that decision rather than making one.
 *
 * `None` and anything unrecognised render NO chip. That is deliberate and is
 * the same rule the rest of the alert card follows: a missing answer is
 * silence, not a placeholder. A chip reading "None" would occupy the most
 * prominent slot in the row to say nothing.
 */

/**
 * CAP response value → chip text. Keys are the CAP 1.2 enumeration as NWS
 * spells it; lookup is case-insensitive so a provider casing change cannot
 * silently drop the chip.
 */
const RESPONSE_LABELS = Object.freeze({
  shelter: "Take shelter",
  evacuate: "Evacuate",
  prepare: "Prepare",
  execute: "Follow instructions",
  avoid: "Avoid the area",
  monitor: "Monitor conditions",
  assess: "Assess the situation",
  allclear: "All clear",
});

/**
 * Resolves a CAP `response` value to its chip text.
 * @param {unknown} response Raw provider value, or anything else.
 * @returns {string|null} The chip text, or null when no chip should render —
 *   for `None`, an unrecognised token, a non-string, or an empty string.
 */
export function getAlertResponseLabel(response) {
  if (typeof response !== "string") {
    return null;
  }

  const normalized = response.trim().toLowerCase();
  if (normalized === "" || normalized === "none") {
    return null;
  }

  return RESPONSE_LABELS[normalized] ?? null;
}
