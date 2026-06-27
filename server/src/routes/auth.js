import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { toUser, USER_COLUMNS } from '../services/userProjection.js';
import { setAuthCookie, clearAuthCookie } from '../lib/authCookie.js';
import { normalizeUsername } from '../lib/username.js';

const router = Router();

// bcrypt "cost factor": higher = slower to hash = harder to brute-force. 12 is a
// sensible modern default (each step doubles the work).
const SALT_ROUNDS = 12;

// A throwaway bcrypt hash computed once at startup. On login, if no user matches
// the username, we still compare the password against THIS hash. bcrypt.compare is
// deliberately slow, so always running it keeps the response time the same whether
// or not the account exists - so the password check itself leaks no timing signal.
// (Usernames are public anyway - they're discoverable via user search - so the goal
// here is protecting the password comparison, not hiding which handles exist.)
const DUMMY_HASH = bcrypt.hashSync('no-user-will-ever-match-this', SALT_ROUNDS);

// POST /api/auth/register
// Create a new account, then log them straight in by issuing the auth cookie.
router.post('/register', async (req, res) => {
  const { email, password, displayName, username } = req.body ?? {};

  // --- Basic validation ---
  if (!email || !password || !displayName || !username) {
    return res
      .status(400)
      .json({ error: 'email, password, displayName, and username are required' });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: 'password must be at least 8 characters' });
  }
  // displayName must be a real non-blank string (the truthy check above still lets
  // whitespace-only through). Mirrors PATCH /me, which trims and rejects blanks -
  // so the two write paths can't disagree on what a valid name is.
  if (typeof displayName !== 'string' || displayName.trim() === '') {
    return res.status(400).json({ error: 'displayName must be a non-empty string' });
  }
  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'email must be a string' });
  }
  // Same handle rules as PATCH /me, via the shared validator.
  const uname = normalizeUsername(username);
  if (!uname.ok) {
    return res.status(400).json({ error: uname.error });
  }

  // Store trimmed values so stray surrounding whitespace can't sneak into the
  // account (and so " a@b.com " and "a@b.com" can't become two different logins).
  const cleanEmail = email.trim();
  const cleanDisplayName = displayName.trim();

  try {
    // Hash the password. bcrypt generates a random salt and embeds it in the
    // output, so we never store (or even see) the plaintext.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Parameterized query: values are sent separately from the SQL, which makes
    // SQL injection impossible. RETURNING hands back the new row - note we
    // deliberately never select password_hash.
    const result = await query(
      `INSERT INTO users (email, password_hash, display_name, username)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [cleanEmail, passwordHash, cleanDisplayName, uname.value]
    );
    const user = result.rows[0];

    setAuthCookie(res, user.id);
    return res.status(201).json({ user: toUser(user) });
  } catch (err) {
    // 23505 = unique_violation. Two columns are unique here - email and username -
    // so we disambiguate by the constraint name to return the right message.
    if (err.code === '23505') {
      if (err.constraint === 'users_username_key') {
        return res.status(409).json({ error: 'that username is already taken' });
      }
      return res
        .status(409)
        .json({ error: 'an account with that email already exists' });
    }
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// POST /api/auth/login
// Verify credentials and, on success, issue the auth cookie. Users log in with their
// username (the unique, case-insensitive handle), not their email - display_name
// isn't unique, so it could never identify a single account.
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    // We need password_hash here (unlike register's RETURNING) to compare against.
    // username is CITEXT, so the match is case-insensitive; we trim surrounding
    // whitespace to mirror how it was stored. String() keeps a non-string body value
    // from throwing on .trim() - it just won't match a real row.
    const result = await query(
      `SELECT ${USER_COLUMNS}, password_hash
         FROM users
        WHERE username = $1`,
      [String(username).trim()]
    );
    const user = result.rows[0];

    // Always run a comparison - against the real hash if the user exists, or the
    // dummy hash if not - so both paths take the same time (see DUMMY_HASH above).
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      // Intentionally vague: we don't reveal whether it was the username or the
      // password that was wrong.
      return res.status(401).json({ error: 'invalid username or password' });
    }

    setAuthCookie(res, user.id);

    // toUser only ever picks safe fields, so password_hash never reaches the client.
    return res.status(200).json({ user: toUser(user) });
  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/auth/me
// Protected: requireAuth runs first and sets req.userId. The frontend calls this
// on load to find out whether anyone is currently logged in.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT ${USER_COLUMNS}
         FROM users
        WHERE id = $1`,
      [req.userId]
    );
    const user = result.rows[0];

    if (!user) {
      // Token was valid but the account is gone (e.g. it was deleted).
      return res.status(401).json({ error: 'not authenticated' });
    }
    return res.json({ user: toUser(user) });
  } catch (err) {
    console.error('Fetching current user failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// POST /api/auth/logout
// Clears the auth cookie. Safe to call even when logged out.
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

export default router;
