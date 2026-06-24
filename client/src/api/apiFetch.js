// The one place that knows HOW to talk to our backend. Every API call in the app
// goes through here, so the cross-cutting concerns - the /api prefix, sending the
// auth cookie, JSON encoding, and turning error responses into thrown errors - are
// handled once instead of being re-implemented in every component.

const API_BASE = '/api';

// A thrown ApiError carries the HTTP status alongside the message, so callers can
// branch on it (e.g. err.status === 401 -> send them to the login page) while
// still having err.message ready to show the user. Subclassing Error means
// `instanceof ApiError` works and stack traces stay intact.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Pull a user-facing message out of a caught error. An ApiError already carries the
// server's own wording (or our network fallback), so we use it directly; anything
// else (an unexpected runtime error) gets the generic fallback. Saves every caller
// from re-writing the same `instanceof ApiError` check.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error instanceof ApiError ? error.message : fallback;
}

// A single handler the app can register to be told "a request just came back 401
// while we thought we were logged in" - i.e. the session expired or was revoked
// mid-use. apiFetch is a plain module and can't touch React's auth state directly,
// so AuthProvider registers a callback here (which clears the user, and the
// declarative ProtectedRoute then redirects to login). One slot is enough: there's
// exactly one auth context. setUnauthorizedHandler returns an unsubscribe function
// so the provider can clean up on unmount.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null;
  };
}

// Make a request to `path`, which is relative to /api (e.g. '/auth/me' hits
// /api/auth/me, which the Vite dev proxy forwards to the Express server). Options:
//   method - 'GET' (default), 'POST', 'PATCH', 'DELETE'
//   body   - a plain object; it's JSON-encoded and the Content-Type header is set
//            for you. Omit it for GETs or bodyless writes.
//   signal - an optional AbortSignal. Pass one to cancel the request in flight
//            (e.g. a superseded search keystroke); aborting rejects with an
//            AbortError, which we deliberately let through unchanged (see below).
//   isAuthRequest - set true for the auth-flow calls themselves (login, register,
//            getMe, logout). For those a 401 is an EXPECTED answer ("wrong password",
//            "not logged in yet"), not a session that died mid-use - so we skip the
//            global unauthorized handler and just let the caller handle the error.
// Resolves to the parsed JSON body on success; throws ApiError on any non-2xx.
export async function apiFetch(path, { method = 'GET', body, signal, isAuthRequest = false } = {}) {
  const options = {
    method,
    // Send (and accept) our httpOnly auth cookie. fetch omits cookies by default,
    // so without this every protected route would behave as if we're logged out.
    credentials: 'include',
    headers: {},
    // Undefined is fine - fetch simply ignores a missing signal.
    signal,
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    // An aborted request rejects with an AbortError. That's not a failure - it's us
    // cancelling on purpose - so rethrow it untouched, letting the caller recognise
    // and ignore it instead of showing a bogus "server's down" message.
    if (err.name === 'AbortError') throw err;
    // Otherwise fetch only rejects on a network-level failure (server down, DNS,
    // refused connection) - never on an HTTP error status. Surface it as a clear,
    // catchable error rather than letting a raw TypeError bubble up.
    throw new ApiError('Could not reach the server. Is it running?', 0);
  }

  // Our API always answers with JSON: successes ({ item }, { user }, { ok: true })
  // and errors ({ error }) alike. Read as text first so an empty body doesn't make
  // JSON.parse throw, and guard the parse in case a proxy/gateway ever returns a
  // non-JSON error page.
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    // A 401 on any NON-auth request means our session is no longer valid (expired,
    // or cleared elsewhere). Notify the app so it can drop the stale user and send
    // them to login - otherwise a background refetch's 401 gets swallowed and the UI
    // looks frozen. We still throw below so the calling code's own catch runs too.
    if (response.status === 401 && !isAuthRequest) {
      onUnauthorized?.();
    }
    // Prefer the server's own message; fall back to a generic one by status.
    const message = data?.error ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data;
}
