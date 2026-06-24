import { useState, useEffect, useCallback } from 'react';
import { listLoans } from '../api/loans.js';
import { getErrorMessage } from '../api/apiFetch.js';

// Fetches the logged-in user's loans into ready-to-render state:
// { items, loading, error, refetch }. A sibling of useLibrary - the same hand-rolled
// shape over apiFetch - kept specific to loans rather than a generic useAsync. (If a
// third near-identical call site appears, THAT's the moment to extract a generic
// version; abstracting at two tends to fit neither.)
//
//   direction - optional 'lent_out' | 'borrowed' filter; changing it refetches.
//   active    - optional true | false (not-returned vs returned); changing refetches.
//
// `refetch` lets a component reload after a mutation (mark-returned, edit, delete in
// 6c) so the list reflects the new truth.
export function useLoans({ direction, active } = {}) {
  const [items, setItems] = useState([]);
  // Initial load only - see useLibrary for the full reasoning. We never re-set this
  // true on a refetch, so a background reload leaves the current list on screen
  // (stale-while-revalidate) instead of flashing a spinner.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by refetch to force the effect to run again, so every load shares the one
  // cancellation guard below (no fetching lives outside this effect).
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Clear any prior error so a failed load doesn't linger once we retry or change
      // filters. We don't set loading=true here (see the useState note above).
      setError(null);
      try {
        const { items } = await listLoans({ direction, active });
        if (!cancelled) setItems(items);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your loans.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [direction, active, reloadIndex]);

  const refetch = useCallback(() => setReloadIndex((n) => n + 1), []);

  return { items, loading, error, refetch };
}
