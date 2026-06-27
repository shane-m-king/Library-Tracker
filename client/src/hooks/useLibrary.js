import { useCallback } from 'react';
import { listLibrary } from '../api/library.js';
import { useApiResource } from './useApiResource.js';

// Fetches the logged-in user's library as ready-to-render state:
// { items, loading, error, refetch }. A thin adapter over useApiResource - it owns
// only the endpoint and its one param; the fetch lifecycle (stale-while-revalidate
// loading, the generation guard, the awaitable-reject refetch) lives in the shared
// hook.
//
//   status - optional 'owned' | 'wishlist' filter; changing it refetches.
//
// `refetch` reloads after a mutation (an edit or delete) so the list reflects the
// new truth; it rejects if the reload fails (see useApiResource).
export function useLibrary({ status } = {}) {
  // Memoised with `status` as its dep so the shared hook reloads when (and only
  // when) the filter changes. We unwrap the `{ items }` envelope here so `data` is
  // the array itself.
  const fetcher = useCallback(async () => (await listLibrary({ status })).items, [status]);
  const { data, loading, error, refetch } = useApiResource(
    fetcher,
    'Could not load your library.'
  );
  // `data` is null until the first load settles; present it as an empty list so
  // callers can always map over `items`.
  return { items: data ?? [], loading, error, refetch };
}
