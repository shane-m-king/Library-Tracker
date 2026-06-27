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

  // A transient banner: { text, tone }, same pattern as LibraryPage.
  const [notice, setNotice] = useState(null);
  const showNotice = (text, tone = 'success') => setNotice({ text, tone });
  // The friendship id whose action is in flight, so just that row's buttons disable.
  const [busyId, setBusyId] = useState(null);

  // Pending requests split by direction (one fetch, partitioned in memory):
  // incoming = waiting on you (accept/decline), outgoing = sent by you (cancel).
  const incoming = requests.filter((r) => r.direction === 'incoming');
  const outgoing = requests.filter((r) => r.direction === 'outgoing');

  // Run a per-row action: mark the row busy, do the mutation, confirm it, then
  // refresh the affected lists - holding busy until the refresh settles so the row
  // can't be double-acted. `acted` lets us tell a mutation failure (show the
  // server's message) from a refresh failure (the action DID happen - just warn the
  // view is stale), so we never mislabel one as the other.
  async function act(id, mutate, successText, refetchers) {
    setBusyId(id);
    let acted = false;
    try {
      await mutate();
      acted = true;
      showNotice(successText);
      await Promise.all(refetchers.map((reload) => reload()));
    } catch (err) {
      showNotice(
        acted
          ? 'That worked, but the lists couldn’t refresh — reload to see the latest.'
          : getErrorMessage(err, 'Something went wrong.'),
        'error'
      );
    } finally {
      setBusyId(null);
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

      {notice && (
        <div
          className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : ''}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className={styles.noticeDismiss}
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Pending requests. */}
      <section className={styles.section} aria-label="Pending requests">
        <h2 className={styles.sectionTitle}>Requests</h2>
        {requestsLoading && requests.length === 0 ? (
          <p className={styles.state}>Loading requests…</p>
        ) : requestsError && requests.length === 0 ? (
          <div className={styles.state}>
            <p className={styles.error}>{requestsError}</p>
            <button
              type="button"
              className={styles.retry}
              onClick={() => refetchRequests().catch(() => {})}
            >
              Try again
            </button>
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
                      <button
                        type="button"
                        className={styles.primaryAction}
                        disabled={busyId === req.id}
                        onClick={() => handleAccept(req)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={busyId === req.id}
                        onClick={() => handleDecline(req)}
                      >
                        Decline
                      </button>
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
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={busyId === req.id}
                        onClick={() => handleCancel(req)}
                      >
                        Cancel
                      </button>
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
            <button
              type="button"
              className={styles.retry}
              onClick={() => refetchFriends().catch(() => {})}
            >
              Try again
            </button>
          </div>
        ) : friends.length === 0 ? (
          <p className={styles.state}>
            You don’t have any friends yet. Find people below to send a request.
          </p>
        ) : (
          <ul className={styles.list}>
            {friends.map((friend) => (
              <PersonRow key={friend.id} user={friend.user}>
                <Link to={`/users/${friend.user.id}/library`} className={styles.viewLink}>
                  View library
                </Link>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  disabled={busyId === friend.id}
                  onClick={() => handleUnfriend(friend)}
                >
                  Unfriend
                </button>
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
