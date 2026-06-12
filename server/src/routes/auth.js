import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { toUser } from '../services/userProjection.js';

const router = Router();

// bcrypt "cost factor": higher = slower to hash = harder to brute-force. 12 is a
// sensible modern default (each step doubles the work).
const SALT_ROUNDS = 12;

// How long a login stays valid before the user must sign in again.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// A throwaway bcrypt hash computed once at startup. On login, if no user matches
// the email, we still compare the password against THIS hash. bcrypt.compare is
// deliberately slow, so always running it keeps the response time the same
// whether or not the email exists - denying attackers a timing signal they could
// use to discover which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('no-user-will-ever-match-this', SALT_ROUNDS);

// Sign a JWT identifying the user and attach it as an httpOnly cookie.
// Used by both register and login so the rules live in one place.
function setAuthCookie(res, user) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });

  res.cookie('token', token, {
    httpOnly: true,                                 // JS can't read it -> XSS can't steal it
    sameSite: 'lax',                                // mitigates CSRF
    secure: process.env.NODE_ENV === 'production',  // HTTPS-only once deployed
    maxAge: TOKEN_TTL_SECONDS * 1000,               // cookie lifetime in ms
  });
}

// POST /api/auth/register
// Create a new account, then log them straight in by issuing the auth cookie.
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body ?? {};

  // --- Basic validation ---
  if (!email || !password || !displayName) {
    return res
      .status(400)
      .json({ error: 'email, password, and displayName are required' });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: 'password must be at least 8 characters' });
  }

  try {
    // Hash the password. bcrypt generates a random salt and embeds it in the
    // output, so we never store (or even see) the plaintext.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Parameterized query ($1, $2, $3): values are sent separately from the SQL,
    // which makes SQL injection impossible. RETURNING hands back the new row -
    // note we deliberately never select password_hash.
    const result = await query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, username, library_visibility, created_at`,
      [email, passwordHash, displayName]
    );
    const user = result.rows[0];

    setAuthCookie(res, user);
    return res.status(201).json({ user: toUser(user) });
  } catch (err) {
    // 23505 = Postgres unique_violation. Our UNIQUE(email) constraint is the
    // single source of truth for "is this email taken?" - no race condition.
    if (err.code === '23505') {
      return res
        .status(409)
        .json({ error: 'an account with that email already exists' });
    }
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// POST /api/auth/login
// Verify credentials and, on success, issue the auth cookie.
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    // We need password_hash here (unlike register's RETURNING) to compare against.
    const result = await query(
      `SELECT id, email, display_name, username, library_visibility,
              password_hash, created_at
         FROM users
        WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    // Always run a comparison - against the real hash if the user exists, or the
    // dummy hash if not - so both paths take the same time (see DUMMY_HASH above).
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      // Intentionally vague: we don't reveal whether it was the email or the
      // password that was wrong, so we don't confirm which emails are registered.
      return res.status(401).json({ error: 'invalid email or password' });
    }

    setAuthCookie(res, user);

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
      `SELECT id, email, display_name, username, library_visibility, created_at
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
// Clears the auth cookie. The options (besides maxAge) must match how the cookie
// was set, or the browser may not clear it. Safe to call even when logged out.
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ ok: true });
});

export default router;
