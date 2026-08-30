// src/api/requestSignal.js
//
// Cancellation + timeout composition shared by every provider adapter
// (openMeteo, rainviewer, reverseGeocode), which each hand-rolled the same
// `getSignal` helper with the same two defects.
//
// Two constraints shape this module:
//
// 1. `AbortSignal.any` does not exist on Safari <17 or Firefox <115. The
//    previous composition fell back to returning the caller's signal alone,
//    which dropped the timeout entirely on those engines — and the app always
//    passes a caller signal, so those browsers ran every request with no
//    timeout at all. A manual `AbortController` with `addEventListener`
//    works everywhere, so nothing here depends on `AbortSignal.any` or
//    `AbortSignal.timeout`.
//
// 2. `AbortSignal.timeout()` rejects with `TimeoutError`, not `AbortError`,
//    and the app depends on that distinction: a timeout is retryable and
//    reported as a timeout, a caller abort is neither. The synthesized
//    reasons below preserve those names, and `normalizeError` reports the
//    recorded reason rather than whatever shape the engine's fetch chose.
//
// Every listener and timer registered here is torn down by `release()`, which
// callers must run in a `finally` so a long-lived page cannot leak them.

export function isAbortError(error) {
  return error?.name === "AbortError";
}

export function isTimeoutError(error) {
  return error?.name === "TimeoutError";
}

export function createAbortError(message = "Request aborted") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function createTimeoutError(message = "Request timed out", cause) {
  const error = new Error(message);
  error.name = "TimeoutError";
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function noop() {}

/**
 * Composes a caller's cancellation signal with a request timeout.
 *
 * @param {AbortSignal | undefined | null} callerSignal
 * @param {number} timeoutMs Non-positive or non-finite means "no timeout".
 * @returns {{
 *   signal: AbortSignal | undefined,
 *   release: () => void,
 *   normalizeError: (error: unknown) => unknown,
 * }}
 */
export function createRequestSignal(callerSignal, timeoutMs) {
  if (typeof AbortController === "undefined") {
    return {
      signal: callerSignal ?? undefined,
      release: noop,
      normalizeError: (error) => error,
    };
  }

  const controller = new AbortController();
  const listeners = [];
  let timeoutId = null;
  let abortReason = null;

  function release() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    while (listeners.length) {
      listeners.pop()();
    }
  }

  function abortWith(reason) {
    if (abortReason === null) {
      abortReason = reason;
    }
    release();
    if (!controller.signal.aborted) {
      controller.abort(abortReason);
    }
  }

  if (callerSignal?.aborted) {
    abortWith(callerSignal.reason ?? createAbortError());
  } else if (typeof callerSignal?.addEventListener === "function") {
    const handleAbort = () => {
      abortWith(callerSignal.reason ?? createAbortError());
    };
    callerSignal.addEventListener("abort", handleAbort, { once: true });
    listeners.push(() => {
      callerSignal.removeEventListener?.("abort", handleAbort);
    });
  }

  if (
    !controller.signal.aborted &&
    Number.isFinite(timeoutMs) &&
    timeoutMs > 0
  ) {
    timeoutId = setTimeout(() => {
      timeoutId = null;
      abortWith(
        createTimeoutError(`Request timed out after ${Math.round(timeoutMs)}ms`)
      );
    }, timeoutMs);
  }

  /**
   * The rejection a `fetch` surfaces for an aborted request varies by engine,
   * and a body read cut short by an abort can even surface as a JSON parse
   * failure. Once this signal has aborted, the recorded reason is the truth —
   * it alone carries the AbortError/TimeoutError distinction the UI copy and
   * the retry policy read. Provider errors (`RequestError`, carrying an HTTP
   * status) always pass through untouched.
   */
  function normalizeError(error) {
    if (abortReason === null || error?.name === "RequestError") {
      return error;
    }
    return abortReason;
  }

  return { signal: controller.signal, release, normalizeError };
}
