import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContext.js';
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

  // Each action talks to the API and, on success, updates `user` so the UI reacts.
  // They return (or throw) so the calling form can await and surface errors itself.
  async function login(credentials) {
    const { user } = await authApi.login(credentials);
    setUser(user);
    return user;
  }

  async function register(details) {
    const { user } = await authApi.register(details);
    setUser(user);
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

  const value = { user, loading, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
