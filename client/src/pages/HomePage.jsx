import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import styles from './HomePage.module.css';

// Landing page. It now reflects auth state: a logged-in visitor sees who they are
// plus a way into their library and a logout button; a logged-out visitor sees the
// pitch plus log in / register. This is the visible proof that the cookie session
// is real end-to-end.
export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Library App</h1>

      {user ? (
        <>
          <p className={styles.subtitle}>Logged in as @{user.username}.</p>
          <div className={styles.actions}>
            <Link to="/library" className={styles.cta}>
              My library
            </Link>
            <button type="button" className={styles.secondary} onClick={logout}>
              Log out
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.subtitle}>Track the books you own, want, and lend.</p>
          <div className={styles.actions}>
            <Link to="/login" className={styles.cta}>
              Log in
            </Link>
            <Link to="/register" className={styles.secondary}>
              Register
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
