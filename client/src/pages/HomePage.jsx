import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
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
            <Button as={Link} to="/library" variant="primary" size="lg">
              My library
            </Button>
            <Button as={Link} to="/friends" variant="secondary" size="lg">
              Friends
            </Button>
            <Button as={Link} to="/profile" variant="secondary" size="lg">
              Profile
            </Button>
            <Button variant="secondary" size="lg" onClick={logout}>
              Log out
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.subtitle}>Track the books you own, want, and lend.</p>
          <div className={styles.actions}>
            <Button as={Link} to="/login" variant="primary" size="lg">
              Log in
            </Button>
            <Button as={Link} to="/register" variant="secondary" size="lg">
              Register
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
