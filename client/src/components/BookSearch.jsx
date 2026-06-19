import { useState, useEffect } from 'react';
import { searchBooks } from '../api/books.js';
import { addBook } from '../api/library.js';
import { ApiError, getErrorMessage } from '../api/apiFetch.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import styles from './BookSearch.module.css';

// The shortest query we'll search for. One or two stray characters match half of
// Google Books and waste a request, so we wait for something meaningful.
const MIN_QUERY_LENGTH = 2;

// Search Google Books and add a result to the library as 'owned' or 'wishlist'.
// Presentational + self-contained: it owns its search and per-result add state but
// nothing about WHERE it's shown, so it drops into the add-book modal. It tells its
// parent when a book was added via onAdded(), letting the parent refresh the list.
//
// Search is live (search-as-you-type) with two safeguards that make that safe:
//   - Debounce: we react to the query only after typing pauses (see
//     useDebouncedValue), so a 10-character title is one request, not ten - which
//     also keeps us clear of Google's rate limit.
//   - AbortController: each search aborts the previous in-flight request, so a
//     superseded keystroke can't come back late and overwrite newer results (the
//     classic out-of-order autocomplete bug), and we stop wasting a request we no
//     longer care about.
//
// Props: onAdded - optional callback fired after a successful add (the library page
// passes its refetch here so the list reflects the new book).
export default function BookSearch({ onAdded }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);

  // Results and any error, plus the query they belong to. We DON'T store a separate
  // "searchState" enum and set it synchronously - that would mean setState in the
  // effect body (an extra render pass). Instead the effect only writes state from
  // its async callbacks, and the lifecycle is DERIVED below from these values.
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [settledQuery, setSettledQuery] = useState(''); // the query results/error are for

  // Per-result add status, keyed by googleVolumeId, so each card reports its own
  // progress without touching the others. Each entry is { phase, addedAs?, message? }
  // where phase is 'adding' | 'added' | 'error'. We use `phase` (not `status`) here
  // so it never reads as the book's owned/wishlist status.
  const [addState, setAddState] = useState({});

  const trimmed = debouncedQuery.trim();

  // Derive the lifecycle from state rather than storing it:
  //   idle    - nothing worth searching yet
  //   loading - we have a searchable query but no settled result for it yet
  //   error   - the settled result for this query was a failure
  //   done    - results are in (possibly empty) for exactly this query
  let searchState;
  if (trimmed.length < MIN_QUERY_LENGTH) searchState = 'idle';
  else if (settledQuery !== trimmed) searchState = 'loading';
  else if (error) searchState = 'error';
  else searchState = 'done';

  // Run the search whenever the debounced query changes. All fetching lives in this
  // one effect, and every state write happens in an async callback (never
  // synchronously in the body), so there's no cascading render.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < MIN_QUERY_LENGTH) return; // too short - don't hit the network

    const controller = new AbortController();

    searchBooks(q, { signal: controller.signal })
      .then((data) => {
        setResults(data.results);
        setError(null);
        setAddState({}); // a fresh result set - drop the old per-result add statuses
        setSettledQuery(q); // marks "results now correspond to q" -> derived 'done'
      })
      .catch((err) => {
        // This search was superseded (or the component unmounted) and we aborted it -
        // a newer one is already in charge, so ignore it entirely.
        if (err.name === 'AbortError') return;
        setError(getErrorMessage(err, 'Search failed. Try again.'));
        setSettledQuery(q); // the failure corresponds to q -> derived 'error'
      });

    // Cleanup runs before the next effect (new keystroke) and on unmount: abort the
    // request still in flight so it can't land late or leak.
    return () => controller.abort();
  }, [debouncedQuery]);

  async function handleAdd(book, status) {
    const id = book.googleVolumeId;
    setAddState((prev) => ({ ...prev, [id]: { phase: 'adding' } }));
    try {
      await addBook({ googleVolumeId: id, status });
      setAddState((prev) => ({ ...prev, [id]: { phase: 'added', addedAs: status } }));
      // Let the parent refresh its library list now that the collection changed.
      onAdded?.();
    } catch (err) {
      // 409 = already in the library; surface that specific case clearly, otherwise
      // fall back to the server's message.
      const message =
        err instanceof ApiError && err.status === 409
          ? 'Already in your library'
          : getErrorMessage(err, 'Could not add that book.');
      setAddState((prev) => ({ ...prev, [id]: { phase: 'error', message } }));
    }
  }

  return (
    <div>
      {/* A form so Enter behaves (and assistive tech sees a search landmark); there's
          no submit button because typing drives the search. preventDefault stops a
          page reload on Enter - the live results are already current. */}
      <form className={styles.searchForm} role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author, ISBN…"
          aria-label="Search for a book"
          autoFocus
        />
      </form>

      {/* Search-level states. Per-result add status is shown inside each card. */}
      {searchState === 'idle' && (
        <p className={styles.state}>Start typing to search for a book to add.</p>
      )}
      {searchState === 'loading' && <p className={styles.state}>Searching…</p>}
      {searchState === 'error' && <p className={styles.error}>{error}</p>}
      {searchState === 'done' && results.length === 0 && (
        <p className={styles.state}>No matches. Try a different search.</p>
      )}

      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((book) => {
            const add = addState[book.googleVolumeId];
            const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
            return (
              <li key={book.googleVolumeId} className={styles.result}>
                {book.thumbnailUrl ? (
                  <img
                    className={styles.cover}
                    src={book.thumbnailUrl}
                    alt={`Cover of ${book.title}`}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.coverFallback} aria-hidden="true">
                    No cover
                  </div>
                )}

                <div className={styles.info}>
                  <h3 className={styles.bookTitle}>{book.title ?? 'Untitled'}</h3>
                  {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
                  <p className={styles.authors}>
                    by {authors}
                    {book.publishedDate ? ` · ${book.publishedDate}` : ''}
                  </p>
                </div>

                <div className={styles.actions}>
                  {add?.phase === 'added' ? (
                    <span className={styles.added}>✓ Added to {add.addedAs}</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.addButton}
                        disabled={add?.phase === 'adding'}
                        onClick={() => handleAdd(book, 'owned')}
                      >
                        {add?.phase === 'adding' ? 'Adding…' : 'Add as owned'}
                      </button>
                      <button
                        type="button"
                        className={styles.addButtonSecondary}
                        disabled={add?.phase === 'adding'}
                        onClick={() => handleAdd(book, 'wishlist')}
                      >
                        Wishlist
                      </button>
                    </>
                  )}
                  {add?.phase === 'error' && (
                    <span className={styles.addError}>{add.message}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
