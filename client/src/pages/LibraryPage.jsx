import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/useLibrary.js';
import { deleteLibraryItem } from '../api/library.js';
import { getErrorMessage } from '../api/apiFetch.js';
import LibraryItemCard from '../components/LibraryItemCard.jsx';
import Modal from '../components/Modal.jsx';
import BookSearch from '../components/BookSearch.jsx';
import EditLibraryItemForm from '../components/EditLibraryItemForm.jsx';
import styles from './LibraryPage.module.css';

// The three filter choices. 'all' is the UI's "no filter" - we translate it to
// undefined for the hook, since the API has no 'all' status (omitting ?status=
// returns everything). Kept as data so the buttons render from one source.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
];

// The user's library: a filterable list of their books, with add / edit / remove.
// Driven by real collection data via the useLibrary hook; all mutations refetch so
// the list always reflects the server.
export default function LibraryPage() {
  const [filter, setFilter] = useState('all');
  // Drives the add-book modal. State-driven (not a route) keeps the library visible
  // behind it and lets us refetch on add without a navigation round-trip.
  const [isAddOpen, setIsAddOpen] = useState(false);
  // The item currently being edited / being removed (null when those modals are
  // closed). Holding the whole item lets the modals show its details.
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // A transient confirmation line, e.g. reporting loans cleared by a change.
  const [notice, setNotice] = useState(null);

  // 'all' means "don't filter", so send undefined; otherwise pass the status
  // through. Changing `filter` re-runs the hook's fetch with the new value.
  const { items, loading, error, refetch } = useLibrary({
    status: filter === 'all' ? undefined : filter,
  });

  // After an edit succeeds: refresh the list, close the modal, and - if the edit was
  // an owned->wishlist switch that cleared loans - say so.
  function handleSaved({ loansRemoved }) {
    setEditingItem(null);
    refetch();
    if (loansRemoved > 0) {
      setNotice(`Saved. ${loansRemoved} lent-out loan${loansRemoved === 1 ? '' : 's'} removed.`);
    }
  }

  // Close the remove-confirmation modal, clearing both its target and any error it
  // was showing - so a stale error from a previous attempt can't reappear when the
  // modal is next opened. Used by the close button, Cancel, and a successful delete.
  function closeDeleteModal() {
    setDeletingItem(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { loansRemoved } = await deleteLibraryItem(deletingItem.id);
      const title = deletingItem.book.title; // capture before we clear deletingItem
      closeDeleteModal();
      refetch();
      setNotice(
        loansRemoved > 0
          ? `Removed “${title}”. ${loansRemoved} lent-out loan${loansRemoved === 1 ? '' : 's'} removed.`
          : `Removed “${title}”.`
      );
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not remove that book.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your library</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setIsAddOpen(true)}
          >
            Add book
          </button>
          <Link to="/" className={styles.backLink}>
            Back home
          </Link>
        </div>
      </div>

      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
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

      {/* Filter tabs. aria-pressed marks the active one for assistive tech; the
          styling does the same job visually. */}
      <div className={styles.filters} role="group" aria-label="Filter library by status">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${styles.filterButton} ${
              filter === key ? styles.filterButtonActive : ''
            }`}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stale-while-revalidate: the big loading/error states only show on the
          INITIAL load (when there's nothing on screen yet). Once we have items, a
          background refetch (after an add/edit/delete, or a filter change) keeps the
          existing list visible instead of flashing it out - the list just updates in
          place when the new data arrives. */}
      {loading && items.length === 0 ? (
        <p className={styles.state}>Loading your library…</p>
      ) : error && items.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.error}>{error}</p>
          <button type="button" className={styles.retry} onClick={refetch}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className={styles.state}>
          {filter === 'all' ? (
            <>
              No books yet.{' '}
              <button type="button" className={styles.linkButton} onClick={() => setIsAddOpen(true)}>
                Add your first book
              </button>
              .
            </>
          ) : (
            `No ${filter} books yet.`
          )}
        </p>
      ) : (
        <ul className={styles.grid}>
          {items.map((item) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              onEdit={setEditingItem}
              onDelete={setDeletingItem}
            />
          ))}
        </ul>
      )}

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add a book">
        {/* refetch on each add so closing the modal reveals an up-to-date list. */}
        <BookSearch onAdded={refetch} />
      </Modal>

      {/* Edit modal. Keyed by item id so switching from one book to another remounts
          the form with fresh initial values rather than reusing stale state. */}
      <Modal
        isOpen={editingItem !== null}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `Edit “${editingItem.book.title}”` : 'Edit'}
      >
        {editingItem && (
          <EditLibraryItemForm
            key={editingItem.id}
            item={editingItem}
            onSaved={handleSaved}
            onCancel={() => setEditingItem(null)}
          />
        )}
      </Modal>

      {/* Remove confirmation. */}
      <Modal
        isOpen={deletingItem !== null}
        onClose={closeDeleteModal}
        title="Remove book"
      >
        {deletingItem && (
          <div className={styles.confirm}>
            <p>
              Remove <strong>{deletingItem.book.title}</strong> from your library? Any
              lent-out loans for it will be removed too. This can’t be undone.
            </p>
            {deleteError && (
              <p className={styles.error} role="alert">
                {deleteError}
              </p>
            )}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.cancel}
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmRemove}
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
