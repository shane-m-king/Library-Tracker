import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query } from '../db.js';
import { toUser, toPublicUser, USER_COLUMNS } from '../services/userProjection.js';
import { isValidId } from '../lib/ids.js';
import { getLibraryItems, LIBRARY_STATUSES } from '../services/libraryItems.js';
import { areFriends } from '../services/friendships.js';
import { clearAuthCookie } from '../lib/authCookie.js';
import { normalizeUsername } from '../lib/username.js';

const router = Router();

const VALID_VISIBILITIES = ['public', 'friends', 'private'];

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
      const result = normalizeUsername(value);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      value = result.value;
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
        RETURNING ${USER_COLUMNS}`,
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

// DELETE /api/users/me
// Permanently delete your own account. The user's library entries, loans, and
// friendships all go with it - every table that references users(id) does so with
// ON DELETE CASCADE, so one delete cleans up the whole graph. The shared catalog
// (books/authors/genres) is untouched. We also clear the auth cookie, since the
// session it represents no longer points at anyone.
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const deleted = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.userId]);

    // Either way, this session is over - drop the cookie.
    clearAuthCookie(res);

    if (deleted.rowCount === 0) {
      // The token was valid but the account was already gone.
      return res.status(401).json({ error: 'not authenticated' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Deleting account failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/users?q=...
// Search for users by handle or display name - how you find people to add as
// friends. Case-insensitive "contains" match on either field, returning public
// profiles only. Yourself is excluded (you don't need to find you).
router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q ?? '').trim();

  // Require a couple of characters: a 1-character (or empty) query would match
  // almost everyone and isn't a meaningful lookup.
  if (q.length < 2) {
    return res
      .status(400)
      .json({ error: 'search query (?q=) must be at least 2 characters' });
  }

  // Escape LIKE wildcards in the user's input so % and _ match literally instead
  // of acting as pattern metacharacters (backslash is Postgres's default LIKE
  // escape). Then wrap in %...% for a "contains" match. ILIKE is case-insensitive;
  // username is CITEXT (already case-insensitive) but ILIKE on it is harmless.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  try {
    const result = await query(
      `SELECT id, display_name, username
         FROM users
        WHERE id <> $2
          AND (username ILIKE $1 OR display_name ILIKE $1)
        ORDER BY username ASC, id ASC
        LIMIT 20`,
      [pattern, req.userId]
    );
    return res.json({ results: result.rows.map(toPublicUser) });
  } catch (err) {
    console.error('User search failed:', err);
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
  if (!isValidId(req.params.id)) {
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

// GET /api/users/:id/library
// View another user's collection, subject to their library_visibility:
//   public  - any logged-in user
//   friends - only an accepted friend of the owner
//   private - only the owner
// You can always view your OWN library here regardless of the setting. When
// allowed, this reuses the exact same getLibraryItems query that powers
// GET /api/library, so a friend sees the identical item shape the owner does.
router.get('/:id/library', requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'user not found' });
  }

  // Same optional status filter as the owner's own library listing.
  const { status } = req.query;
  if (status != null && !LIBRARY_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: "status filter must be 'owned' or 'wishlist'" });
  }

  try {
    const owner = await query(
      'SELECT library_visibility FROM users WHERE id = $1',
      [req.params.id]
    );
    if (owner.rowCount === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    const visibility = owner.rows[0].library_visibility;

    // The gate. You can always see your own; otherwise it's the owner's setting.
    const isOwner = String(req.params.id) === String(req.userId);
    let allowed = isOwner;
    if (!allowed) {
      if (visibility === 'public') allowed = true;
      else if (visibility === 'friends') {
        allowed = await areFriends(req.userId, req.params.id);
      }
      // 'private' stays false for non-owners.
    }

    if (!allowed) {
      // The profile itself is already public (GET /:id), so naming the visibility
      // level leaks nothing new - and it lets the client say "add as a friend to
      // see this" vs "this is private".
      return res.status(403).json({
        error:
          visibility === 'friends'
            ? "this user's library is visible to friends only"
            : "this user's library is private",
        visibility,
      });
    }

    const items = await getLibraryItems({ userId: req.params.id, status: status ?? null });
    return res.json({ items });
  } catch (err) {
    console.error('Fetching user library failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

export default router;
