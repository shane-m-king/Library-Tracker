import { useCallback } from 'react';
import { listFriends } from '../api/friends.js';
import { useApiResource } from './useApiResource.js';

// Fetches the logged-in user's accepted friends as { friends, loading, error,
// refetch }. A thin adapter over useApiResource, like useLibrary/useLoans - it owns
// only the endpoint; the fetch lifecycle lives in the shared hook.
//
// `refetch` reloads after a mutation (accept a request, unfriend someone) so the
// list reflects the new truth; it rejects if the reload fails (see useApiResource).
export function useFriends() {
  const fetcher = useCallback(async () => (await listFriends()).friendships, []);
  const { data, loading, error, refetch } = useApiResource(fetcher, 'Could not load your friends.');
  return { friends: data ?? [], loading, error, refetch };
}
