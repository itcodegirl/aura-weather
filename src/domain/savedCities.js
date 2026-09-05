/**
 * How many cities a user may keep. Product policy, not storage policy: the
 * local list, the merge helper and the cloud backup all cap at the same
 * number, and they must agree or a save silently drops a city.
 *
 * It lived in `hooks/useLocation.js`, which meant `services/savedLocationsSync`
 * imported upward out of the service layer into a React hook to learn a
 * number — the one inversion in a codebase whose README advertises a strict
 * `components → hooks → api/services → utils/domain` direction. Moving it here
 * lets every layer read it downward.
 */
export const MAX_SAVED_CITIES = 6;

/**
 * Trims a place name, falling back when there is nothing usable.
 *
 * A saved city round-trips through a JSON backup, so a stored `name` can be
 * any shape at all. A non-string is treated as an absent name rather than
 * coerced: `String(123)` would put "123" in the saved-cities strip as though
 * the user had named a place that.
 *
 * Three copies of this existed -- in `useLocation.js` (which the two pure
 * helper modules imported upward to reach, dragging React into their module
 * graph) and again as `normalizeName` inside `services/savedLocationsSync`.
 * It belongs beside the cap it is always applied with (audit O-12/A-02).
 */
export function normalizeLocationName(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}
