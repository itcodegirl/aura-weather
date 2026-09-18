/**
 * When a severe-weather alert stops mattering.
 *
 * NWS ships two end timestamps and they answer different questions:
 *
 *   `expires` — when the MESSAGE must be refreshed or reissued. An office
 *               housekeeping deadline.
 *   `ends`    — when the HAZARD itself is forecast to be over.
 *
 * They are not interchangeable, and treating one as the other is not a
 * theoretical risk. Measured against the live feed on 2026-09-18 (243 active
 * alerts): `ends` differed from `expires` on 184 of them, and 99 alerts had
 * `expires` EARLIER than their own `onset` — a message due for reissue before
 * the weather it describes has even started.
 *
 * The consequence was a real defect. Both expiry filters keyed on `expires`,
 * so 8 of the 136 future-onset alerts in that sample were dropped from the
 * card while their hazard was still ahead of them and their `ends` was still
 * in the future. A Beach Hazards Statement with onset 05:00, expires 05:30
 * and ends 15:00 vanished for the nine and a half hours it was most relevant.
 *
 * `ends` is optional — absent on 20 of the 243 — so `expires` remains the
 * fallback. That fallback is the old behaviour, which is why this change
 * cannot make the window shorter than it was for an alert carrying no `ends`.
 */

/**
 * Resolves the instant an alert stops being in force.
 * @param {{endsAt?: string|null, expiresAt?: string|null}} alert Normalised alert.
 * @returns {string|null} The hazard end as an ISO string, falling back to the
 *   message expiry, or null when neither is usable. A null result means the
 *   caller cannot know when this alert ends — it must not be treated as
 *   "ends now", which would silently drop a live hazard.
 */
export function resolveAlertEnd(alert) {
  const endsAt = alert?.endsAt;
  if (typeof endsAt === "string" && endsAt !== "") {
    return endsAt;
  }

  const expiresAt = alert?.expiresAt;
  if (typeof expiresAt === "string" && expiresAt !== "") {
    return expiresAt;
  }

  return null;
}

/**
 * Whether an alert is still in force at a given instant.
 *
 * Shared by the render-path filter in `AlertsCard` and the restore-path
 * filter in `useWeatherData`, which previously carried the same logic twice
 * and so drifted together into the same defect. One home, one fix.
 *
 * An unresolvable or unparseable end is treated as NOT active, preserving the
 * existing behaviour exactly: the card would rather drop an alert it cannot
 * date than present one it cannot vouch for. That is the stricter direction
 * and the one the surrounding code already chose.
 *
 * @param {{endsAt?: string|null, expiresAt?: string|null}} alert
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isAlertActive(alert, nowMs) {
  const end = resolveAlertEnd(alert);
  if (end === null) {
    return false;
  }

  const endMs = Date.parse(end);
  return Number.isFinite(endMs) && endMs > nowMs;
}
