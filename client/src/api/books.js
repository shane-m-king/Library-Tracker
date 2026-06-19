// Book catalog API calls (the shared Google Books search), as thin named wrappers
// over apiFetch. This is the read-only search endpoint; caching a book into our DB
// only happens when the user adds it to their library (see addBook in api/library).

import { apiFetch } from './apiFetch.js';

// GET /api/books/search?q=... -> { results }. Searches Google Books and returns an
// array of normalized books (googleVolumeId, title, authors[], thumbnailUrl, ...).
// The server requires a non-empty q and throws ApiError 400 otherwise, so callers
// should trim/guard before calling.
//
// `signal` is an optional AbortSignal: live search passes one so a superseded
// keystroke's request is actually cancelled, not just ignored.
export function searchBooks(query, { signal } = {}) {
  return apiFetch(`/books/search?q=${encodeURIComponent(query)}`, { signal });
}
