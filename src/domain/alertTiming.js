/**
 * Where a NWS alert sits relative to its own hazard window — the "is this
 * pending or happening" question the card could not answer.
 *
 * ## Which fields
 *
 * CAP separates the life of the MESSAGE from the life of the EVENT:
 *
 *   `effective` / `expires` — the message. When it was issued; when it must
 *                             be reissued or cancelled.
 *   `onset` / `ends`        — the hazard. When the weather begins; when the
 *                             hazard conditions are no longer expected.
 *
 * So the hazard start is `onset`, not `effective`. Measured against the live
 * feed on 2026-09-18 (243 active alerts): `onset` differed from `effective` on
 * 169 — driving "when does this affect me" off `effective` answers "when was
 * this written" on seven alerts in ten. `onset` was absent on 1, so the
 * caller falls back to `effective` before calling here; this function takes
 * one start instant and does not know which field supplied it.
 *
 * The end is `ends`, falling back to `expires`, resolved by the same rule
 * `isAlertActive` uses (domain/alertWindow.js) so the phrase and the filter
 * cannot describe different alerts.
 *
 * ## Why the lead time is bucketed, and coarsely
 *
 * The same reason the nowcast buckets (see analyzeNowcast.js): the resolution
 * does not justify the precision. `onset` on a long-fuse product is a
 * forecaster's judgement about a watch window, revised as the event
 * approaches — not a countdown. In the sample, no future onset was under an
 * hour out; 70 sat 3–12 hours out and 65 sat 12 hours to 2 days out. Printing
 * "about 7 hours" onto a number that will be re-issued twice before it
 * arrives renders two significant figures of confidence onto one.
 *
 * So the phrases carry no remaining-time numeral at all. The bucket BOUNDS
 * are numbers ("within 12 hours"); the remaining time never is. That is the
 * strongest reading of "bucketed, never minutes", and it is the one chosen.
 *
 * Buckets are pure durations, never calendar words. "Later today" is a claim
 * about the alerted location's civil date, which this module has no timezone
 * to resolve and would get wrong across midnight — the same class of bug as
 * the Chicago tornado warning that once read six hours off in London.
 *
 * ## The malformed case
 *
 * An onset AFTER its own end is garbage and is reported as such, before any
 * phase is chosen. An `expires` before `onset` is NOT malformed — 99 of the
 * 243 sampled alerts had exactly that, because `expires` is a message
 * deadline and routinely falls before the weather it describes — and it
 * never reaches this module: the end is resolved to `ends` first.
 */

import { resolveAlertEnd } from "./alertWindow.js";

const MINUTE_MS = 60 * 1000;

/** Lead-time buckets, smallest first. `maxMinutes` is inclusive. */
const LEAD_BUCKETS = Object.freeze([
  { maxMinutes: 60, phrase: "Starts within the hour" },
  { maxMinutes: 6 * 60, phrase: "Starts in the next few hours" },
  { maxMinutes: 12 * 60, phrase: "Starts within 12 hours" },
  { maxMinutes: 24 * 60, phrase: "Starts within a day" },
  { maxMinutes: 48 * 60, phrase: "Starts within 2 days" },
  { maxMinutes: Infinity, phrase: "Starts in more than 2 days" },
]);

const ENDING_SOON_MAX_MINUTES = 60;
const IN_EFFECT_PHRASE = "In effect now";
const ENDING_SOON_PHRASE = "Ends within the hour";

/**
 * Every phrase this module can return, exported so a test can assert the
 * function never says anything outside the approved set.
 */
export const ALERT_TIMING_PHRASES = Object.freeze([
  ...LEAD_BUCKETS.map((bucket) => bucket.phrase),
  IN_EFFECT_PHRASE,
  ENDING_SOON_PHRASE,
]);

function toInstant(value) {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bucketForLead(leadMinutes) {
  return (
    LEAD_BUCKETS.find((bucket) => leadMinutes <= bucket.maxMinutes) ??
    LEAD_BUCKETS[LEAD_BUCKETS.length - 1]
  );
}

/**
 * @typedef {"pending"|"active"|"ended"|"invalid"|"unknown"} AlertTimingPhase
 */

/**
 * Describes where an alert sits relative to its hazard window.
 *
 * @param {unknown} onsetAt  Hazard start, ISO string. The caller supplies
 *   `onsetAt ?? startsAt`; this function does not know which it got.
 * @param {unknown} endsAt   CAP `ends`, ISO string or null.
 * @param {unknown} expiresAt CAP `expires`, ISO string or null. Fallback end.
 * @param {number} nowMs     Injected clock. Callers inside React pass the
 *   shared minute ticker so the phrase recomputes on the card's cadence and
 *   this stays pure.
 * @returns {{ phase: AlertTimingPhase, phrase: string|null }}
 *   A null phrase means the caller renders nothing for the phase — a missing
 *   answer is silence, not a placeholder. The existing "Until …" clause is
 *   the caller's and is unaffected by this result.
 *
 *   `pending`  onset is ahead of now. Phrase is a lead bucket.
 *   `active`   onset has passed and the end has not. "In effect now", or
 *              "Ends within the hour" inside the last hour.
 *   `ended`    the end has passed. Null phrase. The card's filter drops
 *              these before they render; reported here so the function is
 *              honest on its own.
 *   `invalid`  onset is after its own end. Null phrase. Reported before any
 *              phase, so garbage never reads as pending or active.
 *   `unknown`  no usable onset, no usable clock, or a past onset with no
 *              resolvable end (active and ended are indistinguishable).
 *              A FUTURE onset with no end is still `pending`: the start is
 *              known, and saying so is honest.
 */
export function describeAlertTiming(onsetAt, endsAt, expiresAt, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : null;
  if (now === null) {
    return { phase: "unknown", phrase: null };
  }

  const onset = toInstant(onsetAt);
  if (onset === null) {
    return { phase: "unknown", phrase: null };
  }

  const end = toInstant(
    resolveAlertEnd({
      endsAt: typeof endsAt === "string" ? endsAt : null,
      expiresAt: typeof expiresAt === "string" ? expiresAt : null,
    })
  );

  if (end !== null && onset > end) {
    return { phase: "invalid", phrase: null };
  }

  if (onset > now) {
    /*
     * Ceil, not round: at 59 seconds out this is a 1-minute lead, pending,
     * not a 0-minute lead that the `onset > now` check above already ruled
     * out. The value only ever picks a bucket; it is never rendered.
     */
    const leadMinutes = Math.ceil((onset - now) / MINUTE_MS);
    return { phase: "pending", phrase: bucketForLead(leadMinutes).phrase };
  }

  if (end === null) {
    return { phase: "unknown", phrase: null };
  }

  if (now < end) {
    const remainingMinutes = (end - now) / MINUTE_MS;
    return {
      phase: "active",
      phrase:
        remainingMinutes <= ENDING_SOON_MAX_MINUTES
          ? ENDING_SOON_PHRASE
          : IN_EFFECT_PHRASE,
    };
  }

  return { phase: "ended", phrase: null };
}
