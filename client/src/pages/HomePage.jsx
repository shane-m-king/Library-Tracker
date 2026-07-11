import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import Button from '../components/Button.jsx';
import BookCover from '../components/BookCover.jsx';
import styles from './HomePage.module.css';

// Landing page. Auth-aware: a logged-in visitor gets a welcome plus the primary
// way into their library (Friends/Profile/Log out live in the NavBar); a
// logged-out visitor sees the pitch plus log in / register.
//
// The little shelf under the hero is pure decoration: five coverless "books"
// pushed through BookCover's cloth-bound fallback, standing on a plank. It
// costs no new book CSS and quietly shows what the product is.
const DECOR_BOOKS = [
  { title: 'The Wind in the Willows', authors: ['Kenneth Grahame'], thumbnailUrl: null },
  { title: 'Jane Eyre', authors: ['Charlotte Brontë'], thumbnailUrl: null },
  { title: 'The Odyssey', authors: ['Homer'], thumbnailUrl: null },
  { title: 'Walden', authors: ['Henry David Thoreau'], thumbnailUrl: null },
  { title: 'Persuasion', authors: ['Jane Austen'], thumbnailUrl: null },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <main className={styles.page}>
      {/* "Hearth" is the working name - still an open naming decision. */}
      <h1 className={styles.title}>Hearth</h1>
      <p className={styles.tagline}>
        A warm, well-lit home for the books you own, want, and lend.
      </p>

      {user ? (
        <>
          <p className={styles.welcome}>Welcome back, {user.displayName}.</p>
          <div className={styles.actions}>
            <Button as={Link} to="/library" variant="primary" size="lg">
              My library
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          <Button as={Link} to="/login" variant="primary" size="lg">
            Log in
          </Button>
          <Button as={Link} to="/register" variant="secondary" size="lg">
            Register
          </Button>
        </div>
      )}

      <div className={styles.vignette} aria-hidden="true">
        <div className={styles.vignetteBooks}>
          {DECOR_BOOKS.map((book) => (
            <BookCover key={book.title} book={book} />
          ))}
        </div>
        <div className={styles.plank} />
      </div>
    </main>
  );
}
