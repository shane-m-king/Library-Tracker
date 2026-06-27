import { useState, useEffect, useCallback, useRef } from 'react';
import { listLoans } from '../api/loans.js';
import { getErrorMessage } from '../api/apiFetch.js';

// Fetches the logged-in user's loans into ready-to-render state:
// { items, loading, error, refetch }. A sibling of useLibrary - the same hand-rolled
// shape over apiFetch - kept specific to loans rather than a generic useAsync. (If a
// third near-identical call site appears in the social work, THAT's the moment to
// extract a generic version; abstracting at two tends to fit neither.)
//
//   direction - optional 'lent_out' | 'borrowed' filter; changing it refetches.
//   active    - optional true | false (not-returned vs returned); changing refetches.
//
// `refetch` reloads after a mutation (mark-returned, edit, delete) so the list
// reflects the new truth. Like useLibrary's, it REJECTS on failure so a post-
// mutation refresh can tell the reload failed and warn that the list is now stale.
export function useLoans({ direction, active } = {}) {
  const [items, setItems] = useState([]);
  // Initial load only - see useLibrary for the full reasoning. We never re-set this
  // true on a refetch, so a background reload leaves the current list on screen
  // (stale-while-revalidate) instead of flashing a spinner.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Generation id for the in-flight load: each load bumps it on entry and only
  // writes state if its id is still the latest when it settles, so a superseded load
  // skips its writes. One guard for both the effect-driven load and manual refetch -
  // see useLibrary for the full reasoning.
  const requestId = useRef(0);

  // Every state write happens after the await; a failure is recorded in `error` and
  // rethrown so a post-mutation refresh sees it. No loading=true on refetch (the
  // current list stays visible while it revalidates).
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { items } = await listLoans({ direction, active });
      if (id === requestId.current) {
        setItems(items);
        setError(null); // a fresh success clears any error a prior load left showing
      }
    } catch (err) {
      if (id === requestId.current) {
        setError(getErrorMessage(err, 'Could not load your loans.'));
      }
      throw err; // surfaced in `error` above; rethrown so refetch callers see it
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [direction, active]);

  useEffect(() => {
    // Failure is recorded in `error` inside load(); swallow the rejection here so
    // the initial load can't raise an unhandled rejection.
    load().catch(() => {});
  }, [load]);

  return { items, loading, error, refetch: load };
}
