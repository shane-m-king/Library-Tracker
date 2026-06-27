import { useCallback } from 'react';
import { listLoans } from '../api/loans.js';
import { useApiResource } from './useApiResource.js';

// Fetches the logged-in user's loans as ready-to-render state:
// { items, loading, error, refetch }. A thin adapter over useApiResource, sibling
// to useLibrary - it owns only the endpoint and its filters; the fetch lifecycle
// lives in the shared hook.
//
//   direction - optional 'lent_out' | 'borrowed' filter; changing it refetches.
//   active    - optional true | false (not-returned vs returned); changing refetches.
//
// `refetch` reloads after a mutation (mark-returned, edit, delete) so the list
// reflects the new truth; it rejects if the reload fails (see useApiResource).
export function useLoans({ direction, active } = {}) {
  const fetcher = useCallback(
    async () => (await listLoans({ direction, active })).items,
    [direction, active]
  );
  const { data, loading, error, refetch } = useApiResource(fetcher, 'Could not load your loans.');
  return { items: data ?? [], loading, error, refetch };
}
