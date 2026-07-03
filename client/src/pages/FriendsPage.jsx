import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFriends } from '../hooks/useFriends.js';
import { useFriendRequests } from '../hooks/useFriendRequests.js';
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from '../api/friends.js';
import { getErrorMessage } from '../api/apiFetch.js';
import PersonRow from '../components/PersonRow.jsx';
import UserSearch from '../components/UserSearch.jsx';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import { useNotice } from '../hooks/useNotice.js';
import { useRefreshAfterChange } from '../hooks/useRefreshAfterChange.js';
import styles from './FriendsPage.module.css';

// The social hub. Owns the friends + pending-requests data (so a mutation can
// refetch the affected lists) and renders three areas: pending requests
// (incoming/outgoing), your friends, and discovery (find people). Each per-row
// action runs through `act`, which holds the row busy until its lists refresh and
// distinguishes "the action failed" from "it worked but the refresh did".
export default function FriendsPage() {
  const {
    friends,
    loading: friendsLoading,
    error: friendsError,
    refetch: refetchFriends,
  } = useFriends();
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    refetch: refetchRequests,
  } = useFriendRequests();

  const { notice, showNotice, clearNotice } = useNotice();
  const refreshAfterChange = useRefreshAfterChange(showNotice);
  // The set of friendship ids whose action is in flight, so each acting row's buttons
  // disable independently (acting on one row never disables another).
  const [busyIds, setBusyIds] = useState(() => new Set());

  // Pending requests split by direction (one fetch, partitioned in memory):
  // incoming = waiting on you (accept/decline), outgoing = sent by you (cancel).
  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  // Run a per-row action: mark the row busy, do the mutation, confirm it, then
  // refresh the affected lists - holding busy until the refresh settles so the row
  // can't be double-acted. refreshAfterChange handles its own failure (warning that
  // the view is stale) and never rethrows, so the catch below only ever sees a
  // MUTATION error - no need to disambiguate the two.
  async function act(id, mutate, successText, refetchers) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await mutate();
      showNotice(successText);
      await refreshAfterChange(...refetchers);
    } catch (err) {
      showNotice(getErrorMessage(err, 'Something went wrong.'), 'error');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Accepting turns a pending request into a friend, so both lists change.
  const handleAccept = (req) =>
    act(req.id, () => acceptFriendRequest(req.id), `You’re now friends with @${req.user.username}.`, [
      refetchRequests,
      refetchFriends,
    ]);
  const handleDecline = (req) =>
    act(req.id, () => declineFriendRequest(req.id), `Declined @${req.user.username}’s request.`, [
      refetchRequests,
    ]);
  const handleCancel = (req) =>
    act(req.id, () => removeFriendship(req.id), `Withdrew your request to @${req.user.username}.`, [
      refetchRequests,
    ]);
  const handleUnfriend = (friend) =>
    act(friend.id, () => removeFriendship(friend.id), `Removed @${friend.user.username} from your friends.`, [
      refetchFriends,
    ]);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Friends</h1>
        <Link to="/" className={styles.backLink}>
          Back home
        </Link>
      </div>

      <Notice notice={notice} onDismiss={clearNotice} />

      {/* Pending requests. */}
      <section className={styles.section} aria-label="Pending requests">
        <h2 className={styles.sectionTitle}>Requests</h2>
        {requestsLoading && requests.length === 0 ? (
          <p className={styles.state}>Loading requests…</p>
        ) : requestsError && requests.length === 0 ? (
          <div className={styles.state}>
            <p className={styles.error}>{requestsError}</p>
            <Button variant="primary" onClick={() => refetchRequests().catch(() => {})}>
              Try again
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <p className={styles.state}>No pending requests.</p>
        ) : (
          <>
            {incoming.length > 0 && (
              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Incoming</h3>
                <ul className={styles.list}>
                  {incoming.map((req) => (
                    <PersonRow key={req.id} user={req.user}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busyIds.has(req.id)}
                        onClick={() => handleAccept(req)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyIds.has(req.id)}
                        onClick={() => handleDecline(req)}
                      >
                        Decline
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              </div>
            )}
            {outgoing.length > 0 && (
              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Sent</h3>
                <ul className={styles.list}>
                  {outgoing.map((req) => (
                    <PersonRow key={req.id} user={req.user}>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyIds.has(req.id)}
                        onClick={() => handleCancel(req)}
                      >
                        Cancel
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Accepted friends. */}
      <section className={styles.section} aria-label="Your friends">
        <h2 className={styles.sectionTitle}>Your friends</h2>
        {friendsLoading && friends.length === 0 ? (
          <p className={styles.state}>Loading your friends…</p>
        ) : friendsError && friends.length === 0 ? (
          <div className={styles.state}>
            <p className={styles.error}>{friendsError}</p>
            <Button variant="primary" onClick={() => refetchFriends().catch(() => {})}>
              Try again
            </Button>
          </div>
        ) : friends.length === 0 ? (
          <p className={styles.state}>
            You don’t have any friends yet. Find people below to send a request.
          </p>
        ) : (
          <ul className={styles.list}>
            {friends.map((friend) => (
              <PersonRow key={friend.id} user={friend.user}>
                <Button
                  as={Link}
                  to={`/users/${friend.user.id}/library`}
                  variant="secondary"
                  size="sm"
                >
                  View library
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyIds.has(friend.id)}
                  onClick={() => handleUnfriend(friend)}
                >
                  Unfriend
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>

      {/* Discovery. */}
      <section className={styles.section} aria-label="Find people">
        <h2 className={styles.sectionTitle}>Find people</h2>
        <UserSearch />
      </section>
    </main>
  );
}
