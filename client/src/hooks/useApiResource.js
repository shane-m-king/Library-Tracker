import { useState, useEffect, useCallback, useRef } from 'react';
import { getErrorMessage } from '../api/apiFetch.js';

// The shared data-fetching lifecycle behind our resource hooks (useLibrary,
// useLoans, and the social hooks). This is the "extract at the third call site"
// moment: the library, loans, and the upcoming friends / requests / discovery
// reads all want the exact same behaviour, so the subtle parts live in ONE place
// and each resource hook becomes a thin adapter that only knows its endpoint.
//
// What it provides:
//   - stale-while-revalidate `loading`: true for the FIRST load only; a later
//     refetch revalidates in the background with the current data still on screen,
//     instead of flashing a spinner.
//   - a generation guard (requestId): each load tags itself and only writes state
//     if it's still the latest when it settles, so a superseded load (a newer one
//     started - a param change or a fast double refetch) can't overwrite fresher
//     data with its late result. A write from a load that finishes after unmount is
//     a harmless no-op in React, so there's no separate unmount guard.
//   - an awaitable `refetch` that REJECTS on failure, so a caller refetching after
//     a mutation can tell the refresh failed (and warn that the view is now stale)
//     rather than the error being swallowed.
//
// `fetcher` MUST be memoised by the caller (useCallback) with its own params as
// deps: it's the single dependency this hook keys its reload on, which keeps the
// params' exhaustive-deps check where the params actually live - in the caller.
// `errorMessage` is the fallback shown when a failure carries no message of its own.
export function useApiResource(fetcher, errorMessage) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  // The one fetch routine, exposed as `refetch` and run by the effect below. Every
  // state write happens AFTER the await (never synchronously as the effect runs);
  // a failure is recorded in `error` for display AND rethrown so an awaiting caller
  // sees it too. We never set loading=true on a refetch - the first load owns that.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fetcher();
      if (id === requestId.current) {
        setData(result);
        setError(null); // a fresh success clears any error a prior load left showing
      }
    } catch (err) {
      if (id === requestId.current) setError(getErrorMessage(err, errorMessage));
      throw err; // surfaced in `error` above; rethrown so refetch callers see it
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [fetcher, errorMessage]);

  useEffect(() => {
    // The failure is already recorded in `error`, so swallow the rejection here to
    // keep the initial load from raising an unhandled rejection. (A manual refetch's
    // caller handles its own rejection.)
    load().catch(() => {});
  }, [load]);

  return { data, loading, error, refetch: load };
}
