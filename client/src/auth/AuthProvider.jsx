import { useState, useEffect, useRef } from 'react';
import { AuthContext } from './AuthContext.js';
import { setUnauthorizedHandler } from '../api/apiFetch.js';
import * as authApi from '../api/auth.js';

// Holds the current user and exposes the auth actions to the entire app. Mount it
// once near the root (around <App>). The model:
//   - On load we ask the server who we are (GET /api/auth/me). Because the token is
//     an httpOnly cookie that JS can't read, the server is the only source of truth
//     for "am I logged in?".
//   - login / register set `user` from the server's response, so the UI flips to
//     logged-in immediately, with no page reload.
//   - logout clears it.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True only during the initial getMe round-trip. While it's true the app shows a
  // "checking session" placeholder instead of briefly flashing the login page at
  // someone who actually has a valid session.
  const [loading, setLoading] = useState(true);
  // Set when a live session was ended by the server out from under us (a 401 on a
  // normal request - expired or revoked), so the login page can explain the bounce
  // rather than appearing for no reason. Distinct from "never logged in".
  const [sessionExpired, setSessionExpired] = useState(false);

  // The unauthorized handler is registered once and can't read the live `user`
  // (it'd close over the initial null forever). A ref, kept in sync via the effect
  // below, lets it tell "a real session just died" from "a stray 401 while already
  // logged out". Syncing in an effect (not during render) is the rule-approved way;
  // it's settled long before any async request could trigger the handler.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    // `cancelled` guards against setting state after the component unmounts (and
    // tidily handles StrictMode's deliberate double-mount in dev): if we've been
    // torn down before the request resolves, we skip the state updates.
    let cancelled = false;

    async function loadSession() {
      try {
        const { user } = await authApi.getMe();
        if (!cancelled) setUser(user);
      } catch {
        // A 401 - or any failure - simply means "not logged in" for bootstrap.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Let the transport layer tell us when any non-auth request comes back 401 - the
  // session expired or was cleared elsewhere. We just drop the local user; with no
  // user, ProtectedRoute redirects to login on the next render. Clearing an already-
  // null user is a no-op, so a stray 401 while logged out does nothing. The cookie
  // is already invalid (that's why we got 401), so there's no logout call to make.
  // Only flag "session expired" if a user was actually present - that's what makes
  // it an expiry rather than a request that was never authenticated to begin with.
  useEffect(() => {
    return setUnauthorizedHandler(() => {
      if (userRef.current) setSessionExpired(true);
      setUser(null);
    });
  }, []);

  // Each action talks to the API and, on success, updates `user` so the UI reacts.
  // They return (or throw) so the calling form can await and surface errors itself.
  async function login(credentials) {
    const { user } = await authApi.login(credentials);
    setUser(user);
    setSessionExpired(false); // back in - clear any leftover expiry notice
    return user;
  }

  async function register(details) {
    const { user } = await authApi.register(details);
    setUser(user);
    setSessionExpired(false);
    return user;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Even if the request fails (e.g. offline), still drop the local session -
      // the user asked to log out, so the UI should reflect that regardless.
    } finally {
      setUser(null);
    }
  }

  const value = { user, loading, sessionExpired, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
