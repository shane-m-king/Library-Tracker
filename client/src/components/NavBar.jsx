import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Avatar from './Avatar.jsx';
import styles from './NavBar.module.css';

// The persistent top bar, rendered on every page by AppLayout. Auth-aware:
// logged in it carries the section links, the avatar (a link to /profile), and
// log out; logged out it offers log in / register so public pages share the
// same shell.

// NavLink calls this with { isActive } - the current section gets the underline.
function linkClass({ isActive }) {
  return isActive ? `${styles.link} ${styles.activeLink}` : styles.link;
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // logout never throws (the provider drops the session even if the request
  // fails). Navigating home explicitly turns leaving a protected page into a
  // calm landing instead of a ProtectedRoute bounce to /login.
  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className={styles.topbar}>
      {/* "Hearth" is the working name - still an open naming decision. */}
      <Link to="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          🔥
        </span>
        <span className={styles.wordmark}>
          <b>Hearth</b> <span className={styles.wordmarkDim}>· library</span>
        </span>
      </Link>

      {/* One nav shell; only the links inside switch with auth state. */}
      <nav className={styles.nav} aria-label="Primary">
        {user ? (
          <>
            <NavLink to="/library" className={linkClass}>
              My Library
            </NavLink>
            <NavLink to="/friends" className={linkClass}>
              Friends
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/login" className={linkClass}>
              Log in
            </NavLink>
            <NavLink to="/register" className={linkClass}>
              Register
            </NavLink>
          </>
        )}
      </nav>

      {user && (
        <div className={styles.session}>
          <Link
            to="/profile"
            className={styles.avatarLink}
            aria-label={`Profile - ${user.displayName}`}
            title={`Profile - ${user.displayName}`}
          >
            <Avatar name={user.displayName} />
          </Link>
          <button type="button" className={styles.logout} onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </header>
  );
}
