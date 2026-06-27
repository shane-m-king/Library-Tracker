// User/account API calls: thin, named wrappers over apiFetch, mirroring the other
// api/* modules. This covers the logged-in user's OWN account (/me); the public
// discovery + profile + friend-library reads land here in their own steps, so we
// don't ship a wrapper before there's a caller to exercise it.
//
// Each resolves to the server's envelope as-is and throws ApiError on failure.

import { apiFetch } from './apiFetch.js';

// PATCH /api/users/me -> { user }. Partial profile update: `changes` holds only the
// fields the user actually changed (displayName, username, libraryVisibility). The
// server validates the username format and re-checks uniqueness (409 if taken).
// email and password are deliberately not editable here - they need their own flows.
export function updateMe(changes) {
  return apiFetch('/users/me', { method: 'PATCH', body: changes });
}

// DELETE /api/users/me -> { ok: true }. Permanently deletes the account; the user's
// library, loans, and friendships cascade away server-side, and the auth cookie is
// cleared, so the session is over the moment this resolves.
export function deleteMe() {
  return apiFetch('/users/me', { method: 'DELETE' });
}

// GET /api/users?q=... -> { results }. Find people by username or display name
// (case-insensitive "contains", yourself excluded, capped at 20). The server
// requires q to be >= 2 characters and 400s otherwise, so callers gate on length
// before calling. `signal` is an optional AbortSignal so live search can cancel a
// superseded keystroke's request (same shape as books search).
export function searchUsers(query, { signal } = {}) {
  return apiFetch(`/users?q=${encodeURIComponent(query)}`, { signal });
}

// GET /api/users/:id -> { user }. A user's PUBLIC profile (id, displayName,
// username only - never email). Throws ApiError 404 if there's no such user.
export function getUser(id) {
  return apiFetch(`/users/${id}`);
}

// GET /api/users/:id/library -> { items }. View another user's collection, subject
// to their library_visibility. Optional ?status= ('owned' | 'wishlist'). When the
// viewer isn't allowed, the server throws ApiError 403 whose `data.visibility`
// ('friends' | 'private') says why, so the caller can explain the difference.
export function getUserLibrary(id, { status } = {}) {
  const path = status
    ? `/users/${id}/library?status=${encodeURIComponent(status)}`
    : `/users/${id}/library`;
  return apiFetch(path);
}
