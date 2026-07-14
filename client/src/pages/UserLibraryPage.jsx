import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useUser } from '../hooks/useUser.js';
import { useUserLibrary } from '../hooks/useUserLibrary.js';
import ShelfBook from '../components/ShelfBook.jsx';
import Bookshelf from '../components/Bookshelf.jsx';
import HearthBackdrop from '../components/HearthBackdrop.jsx';
import BookDetailModal from '../components/BookDetailModal.jsx';
import Button from '../components/Button.jsx';
import ShelfToolbar from '../components/ShelfToolbar.jsx';
import { sortLibraryItems, matchesLibrarySearch } from '../lib/libraryView.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
// srOnly comes straight from the shared shelf module (cross-file composes
// is banned - see shelfShared.module.css).
import shared from '../components/shelfShared.module.css';
import styles from './UserLibraryPage.module.css';

// Read-only view of ANOTHER user's library, reached from a friend row (or any
// /users/:id/library URL). It composes two reads: the user's public profile (for the
// heading) and their library (visibility-gated server-side). The same ShelfBook +
// BookDetailModal the owner sees are reused - but the modal gets no onEdit/onDelete,
// so it renders as a read-only inspector. The read-only view falls out of the
// optional props.

export default function UserLibraryPage() {
  const { id } = useParams();
  const { user, loading: userLoading, error: userError } = useUser(id);

  const [filter, setFilter] = useState('all');
  // Shelf arrangement + search, client-side over the fetched list - the same
  // controls as the owner's page (see LibraryPage / libraryView.js).
  const [sort, setSort] = useState('recent');
  const [searchInput, setSearchInput] = useState('');
  const query = useDebouncedValue(searchInput);
  // The book currently "off the shelf" - the read-only detail modal's subject.
  const [detailItem, setDetailItem] = useState(null);
  // Hold off the library fetch until we've confirmed the user exists, so a bad id
  // (profile 404) doesn't also fire a doomed library request. Once `user` loads,
  // this flips true and the library loads.
  const { items, blockedVisibility, loading, error, refetch } = useUserLibrary(id, {
    status: filter === 'all' ? undefined : filter,
    enabled: !!user,
  });

  // What the bookcase shows: fetched list, narrowed by search, in the chosen
  // order (same derivation as LibraryPage).
  const shownItems = sortLibraryItems(
    items.filter((item) => matchesLibrarySearch(item, query)),
    sort
  );

  // Gate on the profile first: until we know whose library this is (and that they
  // exist), there's nothing meaningful to show.
  if (userLoading) {
    return (
      <main className={styles.page}>
        <HearthBackdrop />
        <p className={styles.state}>Loading…</p>
      </main>
    );
  }
  if (userError || !user) {
    return (
      <main className={styles.page}>
        <HearthBackdrop />
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
      <HearthBackdrop />
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
          <ShelfToolbar
            filter={filter}
            onFilterChange={setFilter}
            query={searchInput}
            onQueryChange={setSearchInput}
            sort={sort}
            onSortChange={setSort}
          />

          {/* Search results change the shelf silently for a screen-reader
              user; announce the settled count (same as LibraryPage). */}
          {query.trim() !== '' && (
            <p className={shared.srOnly} aria-live="polite">
              {shownItems.length === 1 ? '1 book matches.' : `${shownItems.length} books match.`}
            </p>
          )}

          {/* Stale-while-revalidate: the big states only show on the initial load. */}
          {loading && items.length === 0 ? (
            <p className={styles.state}>Loading library…</p>
          ) : error && items.length === 0 ? (
            <div className={styles.state}>
              <p className={styles.error}>{error}</p>
              <Button variant="primary" onClick={() => refetch().catch(() => {})}>
                Try again
              </Button>
            </div>
          ) : (
            // An empty library (or filter) shows the empty bookcase - same as
            // the owner's page; the shelf announces emptiness to screen
            // readers internally.
            <Bookshelf
              // Remount when any view axis changes so paging snaps back to
              // the first caseful (same as LibraryPage).
              key={`${filter}|${sort}|${query}`}
              items={shownItems}
              renderBook={(item) => (
                // Everything the case shows is on screen at once - load eagerly.
                <ShelfBook key={item.id} item={item} onOpen={setDetailItem} eager />
              )}
            />
          )}

          {/* No onEdit/onDelete -> the detail modal renders read-only. */}
          <BookDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
        </>
      )}
    </main>
  );
}
