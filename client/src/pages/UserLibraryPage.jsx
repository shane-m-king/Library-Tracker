import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useUser } from '../hooks/useUser.js';
import { useUserLibrary } from '../hooks/useUserLibrary.js';
import LibraryItemCard from '../components/LibraryItemCard.jsx';
import styles from './UserLibraryPage.module.css';

// Read-only view of ANOTHER user's library, reached from a friend row (or any
// /users/:id/library URL). It composes two reads: the user's public profile (for the
// heading) and their library (visibility-gated server-side). The same
// LibraryItemCard the owner sees is reused WITHOUT onEdit/onDelete, so it renders
// with no action buttons - the read-only view falls out of the optional props.

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
];

export default function UserLibraryPage() {
  const { id } = useParams();
  const { user, loading: userLoading, error: userError } = useUser(id);

  const [filter, setFilter] = useState('all');
  // Hold off the library fetch until we've confirmed the user exists, so a bad id
  // (profile 404) doesn't also fire a doomed library request. Once `user` loads,
  // this flips true and the library loads.
  const { items, blockedVisibility, loading, error, refetch } = useUserLibrary(id, {
    status: filter === 'all' ? undefined : filter,
    enabled: !!user,
  });

  // Gate on the profile first: until we know whose library this is (and that they
  // exist), there's nothing meaningful to show.
  if (userLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.state}>Loading…</p>
      </main>
    );
  }
  if (userError || !user) {
    return (
      <main className={styles.page}>
        <p className={styles.state}>{userError ?? 'User not found.'}</p>
        <p>
          <Link to="/friends" className={styles.backLink}>
            Back to friends
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{user.displayName}’s library</h1>
          <p className={styles.handle}>@{user.username}</p>
        </div>
        <Link to="/friends" className={styles.backLink}>
          Back to friends
        </Link>
      </div>

      {blockedVisibility ? (
        // Not allowed to see it - explain which case it is. The profile is public, so
        // naming the level leaks nothing the user couldn't already learn.
        <p className={styles.state}>
          {blockedVisibility === 'friends'
            ? `${user.displayName}’s library is visible to friends only. Add them as a friend to see it.`
            : `${user.displayName}’s library is private.`}
        </p>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Filter library by status">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.filterButton} ${
                  filter === key ? styles.filterButtonActive : ''
                }`}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stale-while-revalidate: the big states only show on the initial load. */}
          {loading && items.length === 0 ? (
            <p className={styles.state}>Loading library…</p>
          ) : error && items.length === 0 ? (
            <div className={styles.state}>
              <p className={styles.error}>{error}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => refetch().catch(() => {})}
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className={styles.state}>
              {filter === 'all'
                ? `${user.displayName} hasn’t added any books yet.`
                : `No ${filter} books.`}
            </p>
          ) : (
            <ul className={styles.grid}>
              {items.map((item) => (
                // No onEdit/onDelete -> the card renders read-only.
                <LibraryItemCard key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
