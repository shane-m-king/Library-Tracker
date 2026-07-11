import { useState, useRef } from 'react';
import { useLibrary } from '../hooks/useLibrary.js';
import { useLoans } from '../hooks/useLoans.js';
import { deleteLibraryItem } from '../api/library.js';
import { updateLoan, deleteLoan } from '../api/loans.js';
import { getErrorMessage } from '../api/apiFetch.js';
import { todayIso } from '../lib/dates.js';
import ShelfBook from '../components/ShelfBook.jsx';
import Bookshelf from '../components/Bookshelf.jsx';
import HearthBackdrop from '../components/HearthBackdrop.jsx';
import BookDetailModal from '../components/BookDetailModal.jsx';
import LoanDetailModal from '../components/LoanDetailModal.jsx';
import LoansSection from '../components/LoansSection.jsx';
import Button from '../components/Button.jsx';
import Notice from '../components/Notice.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useNotice } from '../hooks/useNotice.js';
import { useRefreshAfterChange } from '../hooks/useRefreshAfterChange.js';
import BookSearch from '../components/BookSearch.jsx';
import EditLibraryItemForm from '../components/EditLibraryItemForm.jsx';
import RecordLoanForm from '../components/RecordLoanForm.jsx';
import EditLoanForm from '../components/EditLoanForm.jsx';
import ToggleGroup from '../components/ToggleGroup.jsx';
import { LIBRARY_FILTERS } from '../lib/libraryFilters.js';
import styles from './LibraryPage.module.css';

// The user's library: a filterable list of their books, with add / edit / remove.
// Driven by real collection data via the useLibrary hook; all mutations refetch so
// the list always reflects the server.
export default function LibraryPage() {
  const [filter, setFilter] = useState('all');
  // Drives the add-book modal. State-driven (not a route) keeps the library visible
  // behind it and lets us refetch on add without a navigation round-trip.
  const [isAddOpen, setIsAddOpen] = useState(false);
  // The book currently "off the shelf" - the detail modal's subject (null when
  // closed). Its Edit/Remove buttons close it and hand the item to the states below.
  const [detailItem, setDetailItem] = useState(null);
  // The item currently being edited / being removed (null when those modals are
  // closed). Holding the whole item lets the modals show its details.
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // Drives the record-a-loan modal (lend out / borrow), shown from the loans section.
  const [isRecordLoanOpen, setIsRecordLoanOpen] = useState(false);
  // The loan currently "off the shelf" - the loan detail modal's subject (null
  // when closed). Mirrors detailItem: its actions close it and hand the loan on.
  const [detailLoan, setDetailLoan] = useState(null);
  // The loan currently being edited / removed (null when those modals are closed),
  // plus the remove modal's in-flight + error state - mirroring the library ones.
  const [editingLoan, setEditingLoan] = useState(null);
  const [deletingLoan, setDeletingLoan] = useState(null);
  const [deletingLoanBusy, setDeletingLoanBusy] = useState(false);
  const [deleteLoanError, setDeleteLoanError] = useState(null);
  // A transient banner: { text, tone }, where tone is 'success' (default) or 'error'.
  // Most actions confirm success here; mark-returned also reports a failure through it,
  // so the tone stops an error from being styled - and announced - as a success.
  const { notice, showNotice, clearNotice } = useNotice();
  // Which loans view (current/history) LoansSection shows. Lifted here so a mutation
  // that produces a now-ACTIVE loan - recording one, or un-returning one from History
  // - can snap the toggle back to Current; otherwise the result lands in a view the
  // user isn't looking at and appears to vanish.
  const [loansView, setLoansView] = useState('current');

  // The page heading, used as the focus-return target for the delete confirmations:
  // their trigger (a card's Remove button) is removed by the refetch after a delete,
  // so we send focus here - a stable landmark - instead of letting it fall to <body>.
  const headingRef = useRef(null);

  // Re-pull the affected lists after a mutation that already succeeded (shared with
  // FriendsPage): on a refresh failure it warns that the view is stale rather than
  // letting the mismatch pass silently. See the hook for the full reasoning.
  const refreshAfterChange = useRefreshAfterChange(showNotice);

  // 'all' means "don't filter", so send undefined; otherwise pass the status
  // through. Changing `filter` re-runs the hook's fetch with the new value.
  const { items, loading, error, refetch } = useLibrary({
    status: filter === 'all' ? undefined : filter,
  });

  // The loans shown below the library. We fetch all of them (both directions) once
  // and LoansSection splits them; no filter param needed here. Held at this level -
  // rather than inside LoansSection - so the mutations below can refetch it, since a
  // delete or an owned->wishlist edit can clear a book's lent-out loans server-side.
  const {
    items: loans,
    loading: loansLoading,
    error: loansError,
    refetch: refetchLoans,
  } = useLoans();

  // After an edit succeeds: refresh the list, close the modal, and - if the edit was
  // an owned->wishlist switch that cleared loans - say so. We also refetch loans, as
  // that switch removes the book's lent-out loans from the section below.
  function handleSaved({ loansRemoved }) {
    setEditingItem(null);
    if (loansRemoved > 0) {
      showNotice(`Saved. ${loansRemoved} lent-out loan${loansRemoved === 1 ? '' : 's'} removed.`);
    }
    refreshAfterChange(refetch, refetchLoans);
  }

  // Close the remove-confirmation modal, clearing both its target and any error it
  // was showing - so a stale error from a previous attempt can't reappear when the
  // modal is next opened. Used by the close button, Cancel, and a successful delete.
  function closeDeleteModal() {
    setDeletingItem(null);
    setDeleteError(null);
  }

  // After a loan is recorded: close the modal, refresh the loans section, and confirm
  // it with a direction-aware notice. The library itself is unaffected - lending
  // doesn't change ownership, and borrowing only caches the book in the catalog - so
  // there's no library refetch here.
  function handleLoanCreated(loan) {
    setIsRecordLoanOpen(false);
    // A newly recorded loan is always active, so make sure Current is showing.
    setLoansView('current');
    showNotice(
      loan.direction === 'lent_out'
        ? `Lent “${loan.book.title}” to ${loan.counterpartyName}.`
        : `Recorded borrowing “${loan.book.title}” from ${loan.counterpartyName}.`
    );
    refreshAfterChange(refetchLoans);
  }

  // One-click "Mark returned" from a loan card: stamp returnedOn with today and
  // refresh. It's reversible (the edit form can clear the date), so no confirm.
  async function handleMarkReturned(loan) {
    try {
      await updateLoan(loan.id, { returnedOn: todayIso() });
      showNotice(`Marked “${loan.book.title}” returned.`);
      refreshAfterChange(refetchLoans);
    } catch (err) {
      showNotice(getErrorMessage(err, 'Could not mark that loan returned.'), 'error');
    }
  }

  // After a loan edit succeeds: close the modal and refresh the loans section. If the
  // edit un-returned the loan (it's now active), snap to Current so the reopened loan
  // is visible; a still-returned loan (e.g. a notes-only edit from History) leaves the
  // view alone so the edited row stays put.
  function handleLoanSaved(updatedLoan) {
    setEditingLoan(null);
    if (updatedLoan?.active) setLoansView('current');
    refreshAfterChange(refetchLoans);
  }

  // Close the loan remove-confirmation modal, clearing its target and any error -
  // so a stale error can't reappear on the next open (same pattern as the library).
  function closeLoanDeleteModal() {
    setDeletingLoan(null);
    setDeleteLoanError(null);
  }

  async function handleConfirmDeleteLoan() {
    setDeletingLoanBusy(true);
    setDeleteLoanError(null);
    try {
      const title = deletingLoan.book.title; // capture before we clear deletingLoan
      await deleteLoan(deletingLoan.id);
      closeLoanDeleteModal();
      showNotice(`Removed the loan for “${title}”.`);
      refreshAfterChange(refetchLoans);
    } catch (err) {
      setDeleteLoanError(getErrorMessage(err, 'Could not remove that loan.'));
    } finally {
      setDeletingLoanBusy(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { loansRemoved } = await deleteLibraryItem(deletingItem.id);
      const title = deletingItem.book.title; // capture before we clear deletingItem
      closeDeleteModal();
      showNotice(
        loansRemoved > 0
          ? `Removed “${title}”. ${loansRemoved} lent-out loan${loansRemoved === 1 ? '' : 's'} removed.`
          : `Removed “${title}”.`
      );
      // Removing the book also clears its lent-out loans below, so refresh both.
      refreshAfterChange(refetch, refetchLoans);
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not remove that book.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className={styles.page}>
      <HearthBackdrop />
      <div className={styles.header}>
        <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
          Your library
        </h1>
        <Button variant="primary" onClick={() => setIsAddOpen(true)}>
          Add book
        </Button>
      </div>

      <Notice notice={notice} onDismiss={clearNotice} />

      {/* Filter tabs. */}
      <ToggleGroup
        options={LIBRARY_FILTERS}
        value={filter}
        onChange={setFilter}
        ariaLabel="Filter library by status"
        className={styles.filters}
      />

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
          {/* The failure is already in `error` (shown above), so ignore the retry's
              own rejection to avoid an unhandled promise rejection. */}
          <Button variant="primary" onClick={() => refetch().catch(() => {})}>
            Try again
          </Button>
        </div>
      ) : (
        // An empty library (or an empty filter) shows the empty bookcase
        // itself - bare shelves say "room to grow" better than a text
        // placeholder, and the Add book button is right above. The shelf
        // announces its emptiness to screen readers internally.
        <Bookshelf
          // Remount when the filter changes so paging snaps back to the first
          // caseful - "shelf 3 of All" means nothing in the Wishlist view.
          key={filter}
          items={items}
          renderBook={(item) => (
            // Every book the case shows is on screen at once, so all covers
            // load eagerly - the shelf IS the page's LCP.
            <ShelfBook key={item.id} item={item} onOpen={setDetailItem} eager />
          )}
        />
      )}

      {/* Borrowed & lent-out books, below the library proper. */}
      <LoansSection
        loans={loans}
        loading={loansLoading}
        error={loansError}
        view={loansView}
        onViewChange={setLoansView}
        onRetry={() => refetchLoans().catch(() => {})}
        onRecordLoan={() => setIsRecordLoanOpen(true)}
        onOpenLoan={setDetailLoan}
      />

      <Modal
        isOpen={isRecordLoanOpen}
        onClose={() => setIsRecordLoanOpen(false)}
        title="Record a loan"
      >
        {isRecordLoanOpen && (
          <RecordLoanForm
            loans={loans}
            onCreated={handleLoanCreated}
            onCancel={() => setIsRecordLoanOpen(false)}
          />
        )}
      </Modal>

      {/* The "loan off the shelf" detail view. Its actions close it first, then
          hand the loan on - one dialog at a time, like the book detail modal.
          Focus returns to the heading: Mark returned removes the triggering
          cover from the Current shelf, so the cover can't be trusted to
          still exist when the modal closes. */}
      <LoanDetailModal
        loan={detailLoan}
        onClose={() => setDetailLoan(null)}
        returnFocusRef={headingRef}
        onMarkReturned={(loan) => {
          setDetailLoan(null);
          handleMarkReturned(loan);
        }}
        onEdit={(loan) => {
          setDetailLoan(null);
          setEditingLoan(loan);
        }}
        onDelete={(loan) => {
          setDetailLoan(null);
          setDeletingLoan(loan);
        }}
      />

      {/* Edit-loan modal. Keyed by loan id so switching loans remounts the form with
          fresh initial values rather than reusing stale state. Focus returns to the
          heading on close: its trigger lives in the loan detail modal, already gone. */}
      <Modal
        isOpen={editingLoan !== null}
        onClose={() => setEditingLoan(null)}
        title="Edit loan"
        returnFocusRef={headingRef}
      >
        {editingLoan && (
          <EditLoanForm
            key={editingLoan.id}
            loan={editingLoan}
            onSaved={handleLoanSaved}
            onCancel={() => setEditingLoan(null)}
          />
        )}
      </Modal>

      {/* Remove-loan confirmation. */}
      <ConfirmDialog
        isOpen={deletingLoan !== null}
        onClose={closeLoanDeleteModal}
        title="Remove loan"
        onConfirm={handleConfirmDeleteLoan}
        busy={deletingLoanBusy}
        error={deleteLoanError}
        returnFocusRef={headingRef}
      >
        {deletingLoan && (
          <p>
            Remove the loan record for <strong>{deletingLoan.book.title}</strong>? This
            only deletes the loan, not the book. This can’t be undone.
          </p>
        )}
      </ConfirmDialog>

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add a book">
        {/* refetch on each add so closing the modal reveals an up-to-date list. */}
        <BookSearch onAdded={refetch} />
      </Modal>

      {/* The "book off the shelf" detail view. Its Edit/Remove close it first, then
          open the corresponding modal below - one dialog at a time. */}
      <BookDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => {
          setDetailItem(null);
          setEditingItem(item);
        }}
        onDelete={(item) => {
          setDetailItem(null);
          setDeletingItem(item);
        }}
      />

      {/* Edit modal. Keyed by item id so switching from one book to another remounts
          the form with fresh initial values rather than reusing stale state. Focus
          returns to the heading on close: its trigger lives in the detail modal,
          which is already gone. */}
      <Modal
        isOpen={editingItem !== null}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `Edit “${editingItem.book.title}”` : 'Edit'}
        returnFocusRef={headingRef}
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
      <ConfirmDialog
        isOpen={deletingItem !== null}
        onClose={closeDeleteModal}
        title="Remove book"
        onConfirm={handleConfirmDelete}
        busy={deleting}
        error={deleteError}
        returnFocusRef={headingRef}
      >
        {deletingItem && (
          <p>
            Remove <strong>{deletingItem.book.title}</strong> from your library? Any
            lent-out loans for it will be removed too. This can’t be undone.
          </p>
        )}
      </ConfirmDialog>
    </main>
  );
}
