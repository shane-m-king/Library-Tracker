import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { getErrorMessage } from '../api/apiFetch.js';
import styles from './AuthForm.module.css';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const location = useLocation();

  // One state object for the four fields the backend requires. A single change
  // handler keyed by each input's `name` keeps this tidy as fields are added.
  const [form, setForm] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname ?? '/';

  // Registering logs you straight in (the server sets the cookie and returns the
  // user), so the same "have a user -> leave this page" guard as login applies.
  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      // Success: `user` is set -> the guard above redirects on re-render.
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Create your account</h1>

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
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="username">
            Username
          </label>
          <input
            className={styles.input}
            id="username"
            name="username"
            type="text"
            value={form.username}
            onChange={handleChange}
            autoComplete="username"
            // Mirrors the server's rule so the browser catches a bad handle before
            // we even send it; the server remains the real authority.
            pattern="[A-Za-z0-9_]{3,30}"
            title="3 to 30 characters: letters, numbers, or underscores"
            required
          />
          <span className={styles.hint}>
            3–30 characters: letters, numbers, or underscores.
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="displayName">
            Display name
          </label>
          <input
            className={styles.input}
            id="displayName"
            name="displayName"
            type="text"
            value={form.displayName}
            onChange={handleChange}
            autoComplete="name"
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
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <span className={styles.hint}>At least 8 characters.</span>
        </div>

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className={styles.footer}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
