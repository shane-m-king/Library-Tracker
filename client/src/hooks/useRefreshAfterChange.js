import { useCallback } from 'react';

// The stale-view warning shown when a post-mutation refresh fails. Generic wording
// so it fits any list ("the view" covers a page that refreshes more than one).
const STALE_WARNING =
  'That went through, but the view couldn’t be refreshed — reload to see the latest.';

// Returns a `refreshAfterChange(...refetchers)` for re-pulling lists after a mutation
// that ALREADY succeeded on the server. It runs the refetchers and, if any fails,
// warns via `showNotice` that the on-screen view is now stale - the write happened,
// so there's nothing to roll back; the list keeps its previous contents (the hooks
// stale-while-revalidate) and we just say so instead of letting the mismatch pass
// silently.
//
// It swallows the failure (never rethrows), so callers don't have to distinguish a
// refresh failure from a mutation failure - the mutation's own try/catch only ever
// sees the mutation's error. Awaitable: await it to stay "busy" until the refresh
// settles, or fire-and-forget and ignore the returned promise.
//
// `showNotice` should be stable (e.g. from useNotice, which memoises it).
export function useRefreshAfterChange(showNotice) {
  return useCallback(
    async (...refetchers) => {
      try {
        await Promise.all(refetchers.map((reload) => reload()));
      } catch {
        showNotice(STALE_WARNING, 'error');
      }
    },
    [showNotice]
  );
}
