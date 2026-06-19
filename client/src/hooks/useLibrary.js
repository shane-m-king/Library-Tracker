import { useState, useEffect, useCallback } from 'react';
import { listLibrary } from '../api/library.js';
import { getErrorMessage } from '../api/apiFetch.js';

// Fetches the logged-in user's library and exposes it to a component as ready-to-
// render state: { items, loading, error, refetch }. This is where the "hand-rolled
// hooks" decision becomes concrete - it's a small, purpose-built hook over our
// apiFetch wrapper rather than a data-fetching library.
//
// It's deliberately specific to the library (not a generic useAsync). With only one
// call site today, a named hook is easier to read and reason about; if the same
// shape recurs in the add/loans/social work, THAT's the moment to extract a generic
// version - abstracting before you have three call sites tends to fit none of them.
//
//   status - optional 'owned' | 'wishlist' filter; changing it refetches.
//
// The returned `refetch` lets a component reload after it changes something (an
// edit or delete in Step 5c) so the list reflects the new truth.
export function useLibrary({ status } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // A counter we bump to force the effect below to run again. Driving refetch this
  // way - rather than calling the fetch function directly - keeps ALL fetching
  // inside the single effect, so every load (initial, filter change, or manual
  // refetch) shares the one cancellation guard and can't set state after unmount.
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    // Same guard as the auth bootstrap: if the component unmounts (or the filter
    // changes, firing the cleanup) before the request resolves, we skip the state
    // updates so we don't touch a torn-down component or clobber a newer fetch.
    let cancelled = false;

    async function load() {
      // Reset to a clean "loading" state for each run so a previous error or a
      // stale list doesn't linger on screen while the new request is in flight.
      setLoading(true);
      setError(null);
      try {
        const { items } = await listLibrary({ status });
        if (!cancelled) setItems(items);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your library.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [status, reloadIndex]);

  // Stable across renders (empty deps) so components can safely depend on it.
  const refetch = useCallback(() => setReloadIndex((n) => n + 1), []);

  return { items, loading, error, refetch };
}
