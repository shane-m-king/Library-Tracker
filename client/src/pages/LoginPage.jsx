import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { getErrorMessage } from '../api/apiFetch.js';
import styles from './AuthForm.module.css';

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // After auth, return the user to the page they were trying to reach (stashed by
  // ProtectedRoute), or home if they came to the login page directly.
  const redirectTo = location.state?.from?.pathname ?? '/';

  // Declarative redirect: the moment we have a user - whether they were already
  // logged in and landed here, or just submitted the form successfully - we leave
  // the login page. Driving this off `user` instead of calling navigate() inside
  // the submit handler avoids racing the re-render that setting the user triggers.
  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      // Success: `user` is now set, so the guard above redirects on the re-render.
      // We deliberately don't reset `submitting` - the component is on its way out.
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Log in</h1>

      {/* Shown only when a live session was ended out from under the user (see
          AuthProvider), explaining why they landed back here. role="status" so it's
          announced politely without stealing focus like an alert would. */}
      {sessionExpired && (
        <p className={styles.notice} role="status">
          Your session has ended. Please log in again to continue.
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            className={styles.input}
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            className={styles.input}
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className={styles.footer}>
        Need an account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
