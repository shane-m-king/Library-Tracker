import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query } from '../db.js';
import { getFriendshipById, getFriendships } from '../services/friendships.js';
import { isValidId } from '../lib/ids.js';

const router = Router();

// When an INSERT trips the unique-pair index (23505), a relationship between
// these two already exists. Inspect it so we can explain WHY in the 409, rather
// than a generic "duplicate". `me` and `other` are user ids.
async function describeExistingRelationship(me, other) {
  const existing = await query(
    `SELECT status, requester_id FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [me, other]
  );
  const row = existing.rows[0];

  // The row could have vanished between the failed insert and this read (a race
  // with a decline/unfriend). Fall back to a generic message.
  if (!row) return 'a relationship with this user already exists';
  if (row.status === 'accepted') return 'you are already friends with this user';
  // status is 'pending': whose request is it?
  return String(row.requester_id) === String(me)
    ? 'you already have a pending request to this user'
    : 'this user has already sent you a request - accept it instead';
}

// POST /api/friends/requests
// Send a friend request to the user with the given username. Creates a 'pending'
// friendship from you (requester) to them (addressee).
router.post('/requests', requireAuth, async (req, res) => {
  const { username } = req.body ?? {};

  if (typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'username is required' });
  }

  try {
    // Find the target by handle (case-insensitive via the CITEXT column).
    const target = await query(
      'SELECT id FROM users WHERE username = $1',
      [username.trim()]
    );
    if (target.rowCount === 0) {
      return res.status(404).json({ error: 'no user with that username' });
    }
    const addresseeId = target.rows[0].id;

    // No befriending yourself. The DB CHECK forbids it too, but a clean 400 beats
    // surfacing a constraint error.
    if (String(addresseeId) === String(req.userId)) {
      return res
        .status(400)
        .json({ error: "you can't send a friend request to yourself" });
    }

    // Optimistic insert: the functional unique index on (LEAST, GREATEST) is the
    // authority on "does a relationship already exist?" - it catches a duplicate
    // in EITHER direction with no check-then-insert race. On conflict we inspect
    // the existing row to craft a meaningful 409.
    let inserted;
    try {
      inserted = await query(
        `INSERT INTO friendships (requester_id, addressee_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [req.userId, addresseeId]
      );
    } catch (err) {
      if (err.code === '23505') {
        const message = await describeExistingRelationship(req.userId, addresseeId);
        return res.status(409).json({ error: message });
      }
      throw err;
    }

    // Re-read through the shared query so the response is the canonical, viewer-
    // relative friendship shape that the GET endpoints also return.
    const friendship = await getFriendshipById(inserted.rows[0].id, req.userId);
    return res.status(201).json({ friendship });
  } catch (err) {
    // 23503 = foreign_key_violation: the requester_id no longer exists (your
    // account was deleted while holding a valid token). Treat as expired session.
    if (err.code === '23503') {
      return res.status(401).json({ error: 'your account no longer exists' });
    }
    console.error('Sending friend request failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/friends
// Your accepted friends. Each item is the friendship from your point of view -
// `user` is the friend, `direction` records who originally sent the request.
router.get('/', requireAuth, async (req, res) => {
  try {
    const friendships = await getFriendships(req.userId, { status: 'accepted' });
    return res.json({ friendships });
  } catch (err) {
    console.error('Listing friends failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/friends/requests
// Your PENDING requests. Optional ?direction=incoming|outgoing splits "requests
// waiting on you" (incoming) from "requests you've sent" (outgoing); omit for both.
router.get('/requests', requireAuth, async (req, res) => {
  const { direction } = req.query;

  if (direction != null && direction !== 'incoming' && direction !== 'outgoing') {
    return res
      .status(400)
      .json({ error: "direction filter must be 'incoming' or 'outgoing'" });
  }

  try {
    const requests = await getFriendships(req.userId, {
      status: 'pending',
      direction: direction ?? null,
    });
    return res.json({ requests });
  } catch (err) {
    console.error('Listing friend requests failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// Accept and decline both target a PENDING request and may only be done by its
// ADDRESSEE (the person who received it). Each is a single conditional write whose
// WHERE clause enforces ownership + state atomically - no check-then-write race.
// When that write matches zero rows, this figures out WHY, so we can return a
// specific status/message instead of a blanket 404. `action` is 'accept'/'decline'
// for the message. It never leaks existence to a non-participant (they get 404).
async function diagnoseResponderMiss(id, me, action) {
  const result = await query(
    'SELECT requester_id, addressee_id, status FROM friendships WHERE id = $1',
    [id]
  );
  const row = result.rows[0];
  if (!row) return { status: 404, error: 'request not found' };

  const meStr = String(me);
  const isRequester = String(row.requester_id) === meStr;
  const isAddressee = String(row.addressee_id) === meStr;

  // Not your friendship at all -> don't confirm it exists.
  if (!isRequester && !isAddressee) return { status: 404, error: 'request not found' };
  // Already accepted: there's nothing pending to act on.
  if (row.status === 'accepted') {
    return { status: 409, error: 'this request has already been accepted' };
  }
  // Pending, and you're a participant but the write missed -> you're the requester
  // (the addressee + pending case would have matched the write).
  if (isRequester) {
    return { status: 409, error: `you can't ${action} a request you sent` };
  }
  return { status: 404, error: 'request not found' };
}

// POST /api/friends/requests/:id/accept
// Accept a pending request addressed to you: flip it to 'accepted' and stamp
// responded_at. Returns the now-accepted friendship.
router.post('/requests/:id/accept', requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'request not found' });
  }

  try {
    const updated = await query(
      `UPDATE friendships
          SET status = 'accepted', responded_at = now()
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING id`,
      [req.params.id, req.userId]
    );

    if (updated.rowCount === 0) {
      const { status, error } = await diagnoseResponderMiss(req.params.id, req.userId, 'accept');
      return res.status(status).json({ error });
    }

    const friendship = await getFriendshipById(req.params.id, req.userId);
    return res.json({ friendship });
  } catch (err) {
    console.error('Accepting friend request failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// POST /api/friends/requests/:id/decline
// Decline a pending request addressed to you: the request is deleted outright (we
// don't keep a 'declined' tombstone). Idempotent in spirit - once gone, it's gone.
// (Withdrawing a request YOU sent is a different action - that'll be DELETE /:id.)
router.post('/requests/:id/decline', requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'request not found' });
  }

  try {
    const deleted = await query(
      `DELETE FROM friendships
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
        RETURNING id`,
      [req.params.id, req.userId]
    );

    if (deleted.rowCount === 0) {
      const { status, error } = await diagnoseResponderMiss(req.params.id, req.userId, 'decline');
      return res.status(status).json({ error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Declining friend request failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// Explain why the conditional DELETE below matched nothing, mirroring the
// accept/decline diagnosis. Never leaks existence to a non-participant.
async function diagnoseDeleteMiss(id, me) {
  const result = await query(
    'SELECT requester_id, addressee_id, status FROM friendships WHERE id = $1',
    [id]
  );
  const row = result.rows[0];
  if (!row) return { status: 404, error: 'friendship not found' };

  const meStr = String(me);
  const isRequester = String(row.requester_id) === meStr;
  const isAddressee = String(row.addressee_id) === meStr;

  if (!isRequester && !isAddressee) return { status: 404, error: 'friendship not found' };
  // The only participant case the delete blocks: a pending request you RECEIVED.
  // Removing that is a decline, not a delete - point them at the right action.
  if (row.status === 'pending' && isAddressee) {
    return { status: 409, error: 'this is an incoming request; decline it instead' };
  }
  return { status: 404, error: 'friendship not found' };
}

// DELETE /api/friends/:id
// Remove a relationship. Two meanings, one endpoint:
//   - unfriend: delete an ACCEPTED friendship - either participant may do this.
//   - cancel:   withdraw a PENDING request you SENT - requester only. (The
//               addressee rejects an incoming request via .../decline instead.)
// The conditional WHERE encodes exactly those rules atomically.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'friendship not found' });
  }

  try {
    const deleted = await query(
      `DELETE FROM friendships
        WHERE id = $1
          AND ( (status = 'accepted' AND (requester_id = $2 OR addressee_id = $2))
             OR (status = 'pending'  AND requester_id = $2) )
        RETURNING id`,
      [req.params.id, req.userId]
    );

    if (deleted.rowCount === 0) {
      const { status, error } = await diagnoseDeleteMiss(req.params.id, req.userId);
      return res.status(status).json({ error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Removing friendship failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

export default router;
