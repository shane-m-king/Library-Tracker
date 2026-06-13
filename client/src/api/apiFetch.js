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

// Make a request to `path`, which is relative to /api (e.g. '/auth/me' hits
// /api/auth/me, which the Vite dev proxy forwards to the Express server). Options:
//   method - 'GET' (default), 'POST', 'PATCH', 'DELETE'
//   body   - a plain object; it's JSON-encoded and the Content-Type header is set
//            for you. Omit it for GETs or bodyless writes.
// Resolves to the parsed JSON body on success; throws ApiError on any non-2xx.
export async function apiFetch(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    // Send (and accept) our httpOnly auth cookie. fetch omits cookies by default,
    // so without this every protected route would behave as if we're logged out.
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    // fetch only rejects on a network-level failure (server down, DNS, refused
    // connection) - never on an HTTP error status. Surface it as a clear,
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
    // Prefer the server's own message; fall back to a generic one by status.
    const message = data?.error ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data;
}
