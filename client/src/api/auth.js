// Auth-related API calls: thin, named wrappers over apiFetch so components and the
// auth context call `login(...)` instead of knowing URLs and HTTP verbs. The
// server sets or clears the httpOnly cookie as a side effect of these calls -
// there's no token for us to read or store on the client.
//
// Each resolves to the server's envelope as-is (e.g. { user }); callers destructure
// what they need. They throw ApiError on failure (see apiFetch).

import { apiFetch } from './apiFetch.js';

// POST /api/auth/register -> { user }. Body must include all four fields; the
// server validates the username format and email/username uniqueness.
export function register({ email, password, displayName, username }) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: { email, password, displayName, username },
  });
}

// POST /api/auth/login -> { user }. A wrong email or password throws ApiError 401.
export function login({ email, password }) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

// POST /api/auth/logout -> { ok: true }. Clears the cookie; safe even if already
// logged out.
export function logout() {
  return apiFetch('/auth/logout', { method: 'POST' });
}

// GET /api/auth/me -> { user }. Throws ApiError 401 when no one is logged in - the
// auth context uses that on load to tell "logged in" from "logged out".
export function getMe() {
  return apiFetch('/auth/me');
}
