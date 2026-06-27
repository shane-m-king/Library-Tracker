import { useState, useEffect, useCallback, useRef } from 'react';
import { listLibrary } from '../api/library.js';
import { getErrorMessage } from '../api/apiFetch.js';

// Fetches the logged-in user's library and exposes it to a component as ready-to-
// render state: { items, loading, error, refetch }. This is where the "hand-rolled
// hooks" decision becomes concrete - it's a small, purpose-built hook over our
// apiFetch wrapper rather than a data-fetching library.
//
// It's deliberately specific to the library (not a generic useAsync). With only a
// couple of call sites today, a named hook is easier to read and reason about; if
// the same shape recurs across the social work (friends, user search, a friend's
// library), THAT's the moment to extract a generic version - abstracting before you
// have three call sites tends to fit none of them.
//
//   status - optional 'owned' | 'wishlist' filter; changing it refetches.
//
// `refetch` reloads after a mutation (an edit or delete) so the list reflects the
// new truth. It returns a promise that REJECTS if the reload fails, so a caller
// refetching after a successful write can tell the refresh failed and warn that the
// on-screen list is now stale - rather than the failure being swallowed silently.
export function useLibrary({ status } = {}) {
  const [items, setItems] = useState([]);
  // `loading` is the INITIAL load only: true until the first fetch settles, then
  // false forever. A background refetch (after an add/edit/delete, or a filter
  // change) deliberately does NOT flip it back, so the existing list stays on
  // screen while the new data loads (stale-while-revalidate) instead of flashing a
  // spinner.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Generation id for the in-flight load. Each load bumps it on entry and captures
  // the new value; when it settles it only writes state if its id is still the
  // latest. That makes a superseded load (a newer one started - a filter change or a
  // fast double refetch) skip its writes, so stale results can't clobber fresh ones.
  // Keeping it in a ref (not an effect-local flag) lets ONE guard cover both the
  // effect-driven load and every manual refetch, which is what lets refetch share
  // the fetch logic and report its own failure. (A write from a load that finishes
  // after unmount is a harmless no-op in React, so no separate unmount guard.)
  const requestId = useRef(0);

  // The single fetch routine, run by the effect on mount / filter change and
  // exposed directly as `refetch`. Every state write happens AFTER the await (never
  // synchronously as the effect runs), and a failure is recorded in `error` for
  // display AND rethrown, so an awaiting caller (a post-mutation refresh) sees it
  // too. We don't set loading=true here: the first load starts in the loading state;
  // later runs revalidate in the background with the current list still visible.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { items } = await listLibrary({ status });
      if (id === requestId.current) {
        setItems(items);
        setError(null); // a fresh success clears any error a prior load left showing
      }
    } catch (err) {
      if (id === requestId.current) {
        setError(getErrorMessage(err, 'Could not load your library.'));
      }
      throw err; // surfaced in `error` above; rethrown so refetch callers see it
    } finally {
      // After the first settle (success or failure) we've left the initial-load
      // state. Idempotent on every subsequent run.
      if (id === requestId.current) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    // The failure is already recorded in `error` inside load(), so the rejection is
    // "handled" for display - swallow it here so the initial load can't raise an
    // unhandled rejection. (A manual refetch's caller handles its own rejection.)
    load().catch(() => {});
  }, [load]);

  return { items, loading, error, refetch: load };
}
