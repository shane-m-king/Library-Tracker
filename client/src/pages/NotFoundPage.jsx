import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import styles from './NotFoundPage.module.css';

// Catch-all for unknown client routes - the UI counterpart to the backend's
// JSON 404, in the app's own voice.
export default function NotFoundPage() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>That page isn&rsquo;t on our shelves.</h1>
      <p className={styles.hint}>The link may be old, or the address mistyped.</p>
      <span className={styles.emblem} aria-hidden="true">
        ❧
      </span>
      <p>
        <Button as={Link} to="/" variant="primary">
          Back home
        </Button>
      </p>
    </main>
  );
}
