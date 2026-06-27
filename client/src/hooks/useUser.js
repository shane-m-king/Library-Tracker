import { useCallback } from 'react';
import { getUser } from '../api/users.js';
import { useApiResource } from './useApiResource.js';

// Fetches a user's PUBLIC profile as { user, loading, error, refetch }. A thin
// adapter over useApiResource. A 404 (no such user) surfaces as `error`, which the
// page renders as "user not found".
export function useUser(userId) {
  const fetcher = useCallback(async () => (await getUser(userId)).user, [userId]);
  const { data, loading, error, refetch } = useApiResource(fetcher, 'Could not load this profile.');
  return { user: data, loading, error, refetch };
}
