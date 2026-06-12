// Shared shape + reads for the friends graph. A friendship row is symmetric in
// the data (requester/addressee), but the API presents it RELATIVE to whoever is
// asking: "the other person" and whether the request was outgoing or incoming.
// Centralizing that here keeps every friends endpoint returning one shape.

import pool from '../db.js';
import { toPublicUser } from './userProjection.js';

// Map a joined friendship row into the API contract, from currentUserId's point
// of view. `direction` says who initiated relative to the viewer; `user` is the
// OTHER party's public profile (never the viewer's own, never private fields).
export function toFriendship(row, currentUserId) {
  return {
    id: row.id,
    status: row.status,
    direction:
      String(row.requester_id) === String(currentUserId) ? 'outgoing' : 'incoming',
    user: toPublicUser({
      id: row.other_id,
      display_name: row.other_display_name,
      username: row.other_username,
    }),
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

// The shared SELECT. $1 is always the viewer (currentUserId). The join picks "the
// other party" with a CASE - whichever side of the friendship ISN'T the viewer -
// so a single query works whether the viewer requested or received.
const FRIENDSHIP_SELECT = `
  SELECT f.id, f.status, f.requester_id, f.created_at, f.responded_at,
         u.id           AS other_id,
         u.display_name AS other_display_name,
         u.username     AS other_username
    FROM friendships f
    JOIN users u
      ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id
                                              ELSE f.requester_id END
`;

// Fetch one friendship by id, mapped - but only if the viewer is actually part of
// it (authorization: you can't read a friendship between two other people). Used
// by writes to re-read their result in the canonical shape. `executor` is the
// pool or a transaction client.
export async function getFriendshipById(id, currentUserId, executor = pool) {
  const result = await executor.query(
    `${FRIENDSHIP_SELECT}
      WHERE f.id = $2
        AND (f.requester_id = $1 OR f.addressee_id = $1)`,
    [currentUserId, id]
  );
  return result.rows[0] ? toFriendship(result.rows[0], currentUserId) : null;
}

// Are these two users accepted friends? Order-independent (checks both
// directions), and only 'accepted' counts - a pending request is not a friendship.
// Used by the library visibility gate.
export async function areFriends(userA, userB, executor = pool) {
  const result = await executor.query(
    `SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND ( (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1) )
      LIMIT 1`,
    [userA, userB]
  );
  return result.rowCount > 0;
}

// List the viewer's friendships, newest first, mapped to the viewer-relative
// shape. Both filters are optional:
//   status    - 'accepted' | 'pending', or null for either
//   direction - 'outgoing' (you requested) | 'incoming' (you received), or null
// Direction is computed relative to the viewer in SQL, so one query serves the
// accepted-friends list and both slices of the pending-requests list.
export async function getFriendships(
  currentUserId,
  { status = null, direction = null } = {},
  executor = pool
) {
  const result = await executor.query(
    `${FRIENDSHIP_SELECT}
      WHERE (f.requester_id = $1 OR f.addressee_id = $1)
        AND ($2::text IS NULL OR f.status = $2)
        AND ($3::text IS NULL OR
             (CASE WHEN f.requester_id = $1 THEN 'outgoing' ELSE 'incoming' END) = $3)
      ORDER BY f.created_at DESC`,
    [currentUserId, status, direction]
  );
  return result.rows.map((row) => toFriendship(row, currentUserId));
}
