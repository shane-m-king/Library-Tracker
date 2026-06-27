import { useCallback } from 'react';
import { listFriendRequests } from '../api/friends.js';
import { useApiResource } from './useApiResource.js';

// Fetches the logged-in user's PENDING friend requests as { requests, loading,
// error, refetch }. We fetch both directions in one call and let the page split them
// into incoming (waiting on you) and outgoing (sent by you) in memory - same
// in-memory partitioning the loans section uses - so there's a single fetch to
// refetch after accepting/declining/cancelling.
export function useFriendRequests() {
  const fetcher = useCallback(async () => (await listFriendRequests()).requests, []);
  const { data, loading, error, refetch } = useApiResource(
    fetcher,
    'Could not load your requests.'
  );
  return { requests: data ?? [], loading, error, refetch };
}
