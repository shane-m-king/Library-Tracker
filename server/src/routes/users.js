import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query } from '../db.js';
import { toUser, toPublicUser } from '../services/userProjection.js';

const router = Router();

const VALID_VISIBILITIES = ['public', 'friends', 'private'];

// Handle format, enforced in the app layer (the DB only guarantees uniqueness):
// 3-30 characters, letters/digits/underscores. No spaces or punctuation, so a
// handle is safe to show raw and to put in a URL later.
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

// Fields a user may change on their OWN profile, mapped API name -> DB column.
// Same whitelist trick as library/loans: blocks mass-assignment and keeps the
// dynamic UPDATE injection-safe (columns come from here, never the request).
// Deliberately ABSENT: email and password - those are sensitive and need their
// own flows (verification / current-password check), not a casual profile PATCH.
const EDITABLE_PROFILE_FIELDS = {
  displayName: 'display_name',
  username: 'username',
  libraryVisibility: 'library_visibility',
};

// PATCH /api/users/me
// Update your own profile. Partial update, same semantics as the other PATCHes:
// only the fields you send are touched. None of these are nullable - display_name
// is NOT NULL, and you shouldn't be able to blank out your handle or visibility -
// so each, if present, must be a valid non-null value.
router.patch('/me', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const values = [];

  for (const [field, column] of Object.entries(EDITABLE_PROFILE_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue; // omitted -> leave alone
    let value = body[field];

    if (field === 'displayName') {
      if (typeof value !== 'string' || value.trim() === '') {
        return res.status(400).json({ error: 'displayName must be a non-empty string' });
      }
      value = value.trim();
    }

    if (field === 'username') {
      if (typeof value !== 'string') {
        return res.status(400).json({ error: 'username must be a string' });
      }
      value = value.trim();
      if (!USERNAME_RE.test(value)) {
        return res.status(400).json({
          error: 'username must be 3-30 characters: letters, numbers, or underscores',
        });
      }
    }

    if (field === 'libraryVisibility' && !VALID_VISIBILITIES.includes(value)) {
      return res
        .status(400)
        .json({ error: "libraryVisibility must be 'public', 'friends', or 'private'" });
    }

    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }

  // req.userId scopes the update to the caller's own row - the authorization here
  // is implicit: you can only ever PATCH yourself.
  values.push(req.userId);
  const userPlaceholder = `$${values.length}`;

  try {
    const result = await query(
      `UPDATE users
          SET ${sets.join(', ')}
        WHERE id = ${userPlaceholder}
        RETURNING id, email, display_name, username, library_visibility, created_at`,
      values
    );

    if (result.rowCount === 0) {
      // The token was valid but the account is gone (e.g. it was deleted).
      return res.status(401).json({ error: 'not authenticated' });
    }
    return res.json({ user: toUser(result.rows[0]) });
  } catch (err) {
    // 23505 = unique_violation: the username is taken (compared case-insensitively
    // because the column is CITEXT).
    if (err.code === '23505') {
      return res.status(409).json({ error: 'that username is already taken' });
    }
    console.error('Updating profile failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/users/:id
// A user's PUBLIC profile - what any logged-in user may see about another. Goes
// through toPublicUser, so the response is only id/displayName/username - never
// email or the password hash, even when you look up your own id (you see your own
// full account via GET /api/auth/me instead).
//
// Note this is declared AFTER PATCH /me, but there's no conflict: /me is only a
// PATCH, and a non-numeric :id like "me" fails the digit check below anyway.
router.get('/:id', requireAuth, async (req, res) => {
  // :id addresses a BIGINT key; reject non-numeric ids up front so they can't
  // reach Postgres as a type error. A missing user and a malformed id both read
  // as "not found" - we don't distinguish, and we never leak who exists via shape.
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'user not found' });
  }

  try {
    const result = await query(
      `SELECT id, display_name, username FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    return res.json({ user: toPublicUser(result.rows[0]) });
  } catch (err) {
    console.error('Fetching user profile failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

export default router;
