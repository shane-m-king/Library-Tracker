// One home for the auth cookie's name and options, so issuing and clearing it
// always agree. A clearCookie only removes the cookie if its options match how it
// was set, so keeping set + clear here prevents them drifting apart.

import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'token';

// How long a login stays valid before the user must sign in again.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Options shared by setting and clearing. httpOnly keeps JS/XSS from reading the
// token; sameSite mitigates CSRF; secure (HTTPS-only) switches on in production.
function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

// Sign a JWT for this user id and attach it as the auth cookie. Issued on register
// and login.
export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000, // cookie lifetime in ms
  });
}

// Remove the auth cookie - logout, or account deletion. Options must match set.
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, baseCookieOptions());
}
