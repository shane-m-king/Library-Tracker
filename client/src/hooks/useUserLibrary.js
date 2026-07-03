import { useCallback } from 'react';
import { getUserLibrary } from '../api/users.js';
import { ApiError } from '../api/apiFetch.js';
import { useApiResource } from './useApiResource.js';

// Fetches another user's library, subject to their visibility setting. A thin
// adapter over useApiResource, but it treats a 403 specially: being blocked isn't a
// failure, it's an authoritative answer ("you're not allowed, and here's why"). So
// instead of letting the 403 become a generic `error`, the fetcher catches it and
// returns a { blocked: visibility } marker, leaving `error` for genuine failures.
//
// Returns { items, blockedVisibility, loading, error, refetch } where
// blockedVisibility is 'friends' | 'private' when blocked, else null. `enabled`
// (default true) gates the fetch - the page passes false until it has confirmed the
// user exists, so we don't fire a doomed library request while the profile 404s.
export function useUserLibrary(userId, { status, enabled = true } = {}) {
  const fetcher = useCallback(async () => {
    try {
      const { items } = await getUserLibrary(userId, { status });
      return { items };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Not allowed to see it. Surface the level so the page can distinguish
        // "friends only" (add them to see it) from "private" (you never will).
        return { blocked: err.data?.visibility ?? 'private' };
      }
      throw err; // a real error -> useApiResource records it in `error`
    }
  }, [userId, status]);

  const { data, loading, error, refetch } = useApiResource(
    fetcher,
    'Could not load this library.',
    { enabled }
  );

  return {
    items: data?.items ?? [],
    blockedVisibility: data?.blocked ?? null,
    loading,
    error,
    refetch,
  };
}
