// Friends-graph API calls: thin, named wrappers over apiFetch, mirroring the other
// api/* modules. We add a wrapper only once there's a caller for it, so the list
// of read/respond endpoints (list friends, list requests, accept/decline, unfriend)
// lands with the friends-management UI in 7e.
//
// Each resolves to the server's envelope as-is and throws ApiError on failure.

import { apiFetch } from './apiFetch.js';

// POST /api/friends/requests -> { friendship }. Send a friend request to the user
// with this username; the server creates a 'pending' friendship from you to them.
// Throws ApiError on the meaningful conflicts the server distinguishes: 404 (no such
// handle), 400 (yourself), 409 (already friends / already pending / "they've already
// requested you - accept it instead") - each with a user-facing message.
export function sendFriendRequest(username) {
  return apiFetch('/friends/requests', { method: 'POST', body: { username } });
}

// GET /api/friends -> { friendships }. Your ACCEPTED friends, newest first. Each is
// viewer-relative: `user` is the other person, `direction` records who originally
// sent the request.
export function listFriends() {
  return apiFetch('/friends');
}

// GET /api/friends/requests -> { requests }. Your PENDING requests, newest first.
// Optional `direction` ('incoming' = waiting on you | 'outgoing' = sent by you);
// omit it for both, then split in memory.
export function listFriendRequests({ direction } = {}) {
  return apiFetch(direction ? `/friends/requests?direction=${direction}` : '/friends/requests');
}

// POST /api/friends/requests/:id/accept -> { friendship }. Accept a request
// addressed to you; it becomes an accepted friendship.
export function acceptFriendRequest(id) {
  return apiFetch(`/friends/requests/${id}/accept`, { method: 'POST' });
}

// POST /api/friends/requests/:id/decline -> { ok: true }. Decline a request
// addressed to you; the pending row is deleted.
export function declineFriendRequest(id) {
  return apiFetch(`/friends/requests/${id}/decline`, { method: 'POST' });
}

// DELETE /api/friends/:id -> { ok: true }. One endpoint, two meanings the server
// enforces by the row's state: unfriend an ACCEPTED friendship (either participant),
// or withdraw a PENDING request you SENT (requester only).
export function removeFriendship(id) {
  return apiFetch(`/friends/${id}`, { method: 'DELETE' });
}
