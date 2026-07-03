import { useState, useEffect } from 'react';
import { searchUsers } from '../api/users.js';
import { sendFriendRequest } from '../api/friends.js';
import { getErrorMessage } from '../api/apiFetch.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import PersonRow from './PersonRow.jsx';
import Button from './Button.jsx';
import styles from './UserSearch.module.css';

// Find people by username or display name and send them a friend request. This is
// the SECOND search-as-you-type surface (after BookSearch); the two share a debounce
// + per-keystroke AbortController + derived searchState shape. They're kept separate
// for now per "extract at the third call site" - if a third live search appears,
// that's the moment to pull a useDebouncedSearch hook out of both.
//
// The server caps results at 20 and excludes you, so there's no paging here.

// Server requires q >= 2 chars; match that so we never fire a request it would 400.
const MIN_QUERY_LENGTH = 2;

export default function UserSearch() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);

  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [settledQuery, setSettledQuery] = useState(''); // the query results/error are for

  // Per-result request status keyed by user id, so each row reports its own progress.
  // Each entry is { phase: 'sending' | 'sent' | 'error', message? }.
  const [requestState, setRequestState] = useState({});

  const trimmed = debouncedQuery.trim();

  // Derive the lifecycle from state rather than storing it (same approach as
  // BookSearch): idle (nothing worth searching), loading (a searchable query with no
  // settled result yet), error, or done (results in for exactly this query).
  let searchState;
  if (trimmed.length < MIN_QUERY_LENGTH) searchState = 'idle';
  else if (settledQuery !== trimmed) searchState = 'loading';
  else if (error) searchState = 'error';
  else searchState = 'done';

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < MIN_QUERY_LENGTH) return; // too short - don't hit the network

    const controller = new AbortController();

    searchUsers(q, { signal: controller.signal })
      .then((data) => {
        setResults(data.results);
        setError(null);
        setRequestState({}); // a fresh result set - drop the old per-row statuses
        setSettledQuery(q);
      })
      .catch((err) => {
        // Superseded (or unmounted) and aborted - a newer search is in charge, ignore.
        if (err.name === 'AbortError') return;
        setError(getErrorMessage(err, 'Search failed. Try again.'));
        setSettledQuery(q);
      });

    // Abort the in-flight request on the next keystroke / unmount so it can't land late.
    return () => controller.abort();
  }, [debouncedQuery]);

  async function handleSendRequest(user) {
    const id = user.id;
    setRequestState((prev) => ({ ...prev, [id]: { phase: 'sending' } }));
    try {
      await sendFriendRequest(user.username);
      setRequestState((prev) => ({ ...prev, [id]: { phase: 'sent' } }));
    } catch (err) {
      // The server's 409/404/400 messages here are user-facing (e.g. "you are already
      // friends", "accept it instead"), so surface them directly on the row.
      setRequestState((prev) => ({
        ...prev,
        [id]: { phase: 'error', message: getErrorMessage(err, 'Could not send request.') },
      }));
    }
  }

  return (
    <div>
      <form className={styles.searchForm} role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or name…"
          aria-label="Search for people"
        />
      </form>

      {searchState === 'idle' && (
        <p className={styles.state}>Search by username or display name to find people to add.</p>
      )}
      {searchState === 'loading' && <p className={styles.state}>Searching…</p>}
      {searchState === 'error' && <p className={styles.error}>{error}</p>}
      {searchState === 'done' && results.length === 0 && (
        <p className={styles.state}>No people found. Try a different search.</p>
      )}

      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((user) => {
            const req = requestState[user.id];
            return (
              <PersonRow key={user.id} user={user}>
                {req?.phase === 'sent' ? (
                  <span className={styles.sent}>✓ Request sent</span>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={req?.phase === 'sending'}
                    onClick={() => handleSendRequest(user)}
                  >
                    {req?.phase === 'sending' ? 'Sending…' : 'Add friend'}
                  </Button>
                )}
                {req?.phase === 'error' && <span className={styles.addError}>{req.message}</span>}
              </PersonRow>
            );
          })}
        </ul>
      )}
    </div>
  );
}
