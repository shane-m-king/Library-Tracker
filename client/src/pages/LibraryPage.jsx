import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

// Placeholder for the real library view (next step). It sits behind ProtectedRoute,
// so reaching it at all proves you're authenticated - and it reads the current user
// straight from the auth context.
export default function LibraryPage() {
  const { user } = useAuth();

  return (
    <main style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '48px 24px' }}>
      <h1>Your library</h1>
      <p>
        Signed in as @{user.username}. The book list and add-book flow arrive in the
        next step.
      </p>
      <Link to="/">Back home</Link>
    </main>
  );
}
