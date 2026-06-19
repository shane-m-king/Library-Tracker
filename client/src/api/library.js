// Library API calls: thin, named wrappers over apiFetch, mirroring api/auth.js.
// Components and hooks call `listLibrary(...)` instead of knowing URLs, verbs, or
// query-string formatting. Each resolves to the server's envelope as-is (e.g.
// { items }) and throws ApiError on failure (see apiFetch).
//
// The update/delete wrappers land alongside the UI that uses them (Step 5c), so we
// never ship a wrapper before there's a caller to exercise it.

import { apiFetch } from './apiFetch.js';

// GET /api/library -> { items }. Lists the logged-in user's collection, newest
// first. `status` is optional: 'owned' | 'wishlist' to filter, or omitted/null for
// everything. We only append ?status= when it's actually set, so the default call
// stays a clean GET /api/library.
export function listLibrary({ status } = {}) {
  const path = status ? `/library?status=${encodeURIComponent(status)}` : '/library';
  return apiFetch(path);
}

// POST /api/library -> { item }. Adds a book to the user's collection. The client
// sends only the googleVolumeId and the status ('owned' | 'wishlist'); the server
// is the source of truth for catalog data and fetches/caches the book itself.
// Personal details (rating, notes, quantity, ...) are left for the edit step. Throws
// ApiError 409 if the book is already in the user's library.
export function addBook({ googleVolumeId, status }) {
  return apiFetch('/library', {
    method: 'POST',
    body: { googleVolumeId, status },
  });
}

// PATCH /api/library/:id -> { item, loansRemoved }. Partial update: `changes` holds
// only the fields the user actually changed (status, rating, notes, quantity,
// acquiredDate, acquiredPlace). `loansRemoved` is how many lent-out loans an
// owned->wishlist switch cleared (0 for any other edit).
export function updateLibraryItem(id, changes) {
  return apiFetch(`/library/${id}`, {
    method: 'PATCH',
    body: changes,
  });
}

// DELETE /api/library/:id -> { ok: true, loansRemoved }. Removes the entry; any
// lent-out loans for that book are cleared too (reported as loansRemoved).
export function deleteLibraryItem(id) {
  return apiFetch(`/library/${id}`, { method: 'DELETE' });
}
