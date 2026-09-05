/*
 * What the browser claims about connectivity.
 *
 * `navigator.onLine === false` is the one direction worth trusting: true
 * means "an interface is up", which says nothing about reachability, but
 * false is a definite answer. Both callers use it the same way -- to skip a
 * fetch that can only fail -- so neither treats a true as proof of anything.
 *
 * Every guard here matters. `navigator` is absent under Node (the unit
 * suite runs there), and the boolean check keeps a jsdom or polyfill that
 * leaves `onLine` undefined from reading as offline.
 */
export function isBrowserOffline() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    navigator.onLine === false
  );
}
