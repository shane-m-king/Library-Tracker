import jwt from 'jsonwebtoken';

// Gatekeeper for protected routes. It reads the auth cookie, verifies the JWT's
// signature with our secret, and attaches the user's id to the request so the
// handler knows who's asking. If anything is wrong, it responds 401 and the
// request never reaches the route handler.
//
// Usage:  router.get('/something', requireAuth, handler)
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  try {
    // verify() checks the signature AND the expiry. If the token was tampered
    // with or has expired, it throws.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub; // the user id we embedded when signing the token
    next();                   // valid -> hand off to the actual route
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}
