/*
 * The startup-location policy and the copy that explains it.
 *
 * These constants describe *what the app shows when it does not yet know
 * where you are*, and the sentence shown alongside each of those states.
 * They are product decisions, not React ones -- `locationHelpers.js`
 * resolves a cold start from them without rendering anything.
 *
 * They lived in `hooks/useLocation.js`, which imports React. The two pure
 * helper modules beside it had to import upward into that hook to read
 * them, so "pure helper" was only true of the code, not of its module
 * graph: loading `locationHelpers.js` loaded React (audit A-02/O-12).
 * Down here every layer reads them downward, and `src/moduleGraph.test.mjs`
 * holds that line by walking the real import graph.
 */

export const DEFAULT_LOCATION = {
  lat: 41.6967,
  lon: -87.817,
  name: "Palos Hills",
  country: "United States",
};

// Cold start with nothing persisted: Palos Hills really is on screen, so this
// stays accurate. Do not reuse it for a failed lookup — see below.
export const LOCATION_FALLBACK_NOTICE =
  "Showing Palos Hills until you choose a location";

/*
 * Shown when a "My location" request fails after the app is already showing a
 * city. It deliberately does not name a place: the request failing is not a
 * reason to take the reader off what they were looking at, so nothing moves
 * and the notice only explains what happened and how to recover.
 *
 * These used to say "Showing Palos Hills", because the failure paths really
 * did navigate there — a reader looking at Tokyo who tapped the button and
 * declined the prompt lost Tokyo.
 */
export const LOCATION_LOOKUP_FAILED_NOTICE =
  "Couldn't get your location. Search for a city, or try again.";
export const LOCATION_PERMISSION_BLOCKED_NOTICE =
  "Location access is blocked for this site. Allow it in your browser settings, or search for a city.";
export const SAVED_LOCATION_NOTICE = "Showing your previously selected location";
export const LOCATION_UNSUPPORTED_NOTICE =
  "Location access is unavailable in this browser. Search for a city instead.";
export const CURRENT_LOCATION_NAME = "Current location";
export const CURRENT_LOCATION_NOTICE = "Showing your device location";
// Shown when GPS resolved but reverse-geocoding couldn't name the place, so
// the generic "Current location" label is honest about why it's generic
// instead of silently looking like a real place lookup.
export const CURRENT_LOCATION_UNNAMED_NOTICE =
  "Showing your device location - couldn't look up the place name";
