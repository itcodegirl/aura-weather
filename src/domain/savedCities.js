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
