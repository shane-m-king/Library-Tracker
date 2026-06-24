import { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary.js';
import { createLoan } from '../api/loans.js';
import { getErrorMessage } from '../api/apiFetch.js';
import { todayIso } from '../lib/dates.js';
import BookSearch from './BookSearch.jsx';
import styles from './RecordLoanForm.module.css';

// Record a loan from inside the Modal. Two directions, two ways to choose the book:
//   - lent_out: pick from the books you OWN. The server requires ownership to lend
//     (422 otherwise), so a picker of owned books is the right control - you can't
//     pick something invalid. We get the googleVolumeId straight off the owned item.
//   - borrowed: you may not own it, so reuse BookSearch in select mode to find any
//     book on Google and hand it back here.
//
// Props: onCreated(loan) - fired with the created loan on success; onCancel.
const DIRECTIONS = [
  { key: 'lent_out', label: 'Lend out' },
  { key: 'borrowed', label: 'Borrow' },
];

export default function RecordLoanForm({ onCreated, onCancel }) {
  const [direction, setDirection] = useState('lent_out');
  // The two selection mechanisms hold different things: lent_out picks an owned book's
  // googleVolumeId from a <select>; borrowed holds a whole book object from search.
  const [ownedGoogleId, setOwnedGoogleId] = useState('');
  const [borrowBook, setBorrowBook] = useState(null);

  const [counterpartyName, setCounterpartyName] = useState('');
  const [loanedOn, setLoanedOn] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // The owned books that feed the lend-out picker. Reuses the library hook (status
  // 'owned'), fetched once when the modal opens. Harmless when borrowing.
  const { items: ownedItems, loading: ownedLoading, error: ownedError } = useLibrary({
    status: 'owned',
  });

  function switchDirection(next) {
    if (next === direction) return;
    setDirection(next);
    // Book selection means different things per direction, so clear it on a switch.
    setOwnedGoogleId('');
    setBorrowBook(null);
    setError(null);
  }

  // The chosen book's id, whichever path we're on - the single value the API needs.
  const chosenGoogleId =
    direction === 'lent_out' ? ownedGoogleId : borrowBook?.googleVolumeId ?? '';
  const canSubmit = chosenGoogleId !== '' && counterpartyName.trim() !== '' && !submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { item } = await createLoan({
        googleVolumeId: chosenGoogleId,
        direction,
        counterpartyName: counterpartyName.trim(),
        // Send the optional fields only when set; '' -> undefined, dropped from JSON.
        loanedOn: loanedOn || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(item);
    } catch (err) {
      // The server's messages here are already user-facing (e.g. "you must own this
      // book…", "all N owned copies are already lent out"), so surface them directly.
      setError(getErrorMessage(err, 'Could not record that loan.'));
      setSubmitting(false);
    }
  }

  const counterpartyLabel = direction === 'lent_out' ? 'Lent to' : 'Borrowed from';

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <span className={styles.label}>Type</span>
        <div className={styles.directionToggle} role="group" aria-label="Loan type">
          {DIRECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.directionButton} ${
                direction === key ? styles.directionButtonActive : ''
              }`}
              aria-pressed={direction === key}
              onClick={() => switchDirection(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Book selection - a picker of owned books to lend, or a search to borrow. */}
      {direction === 'lent_out' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="loan-book">
            Book
          </label>
          {ownedLoading ? (
            <p className={styles.hint}>Loading your books…</p>
          ) : ownedError ? (
            <p className={styles.error}>{ownedError}</p>
          ) : ownedItems.length === 0 ? (
            <p className={styles.hint}>
              You don’t own any books yet. Add a book to your library first to lend it.
            </p>
          ) : (
            <select
              id="loan-book"
              className={styles.input}
              value={ownedGoogleId}
              onChange={(e) => setOwnedGoogleId(e.target.value)}
            >
              <option value="">Choose a book…</option>
              {ownedItems.map((item) => (
                <option key={item.id} value={item.book.googleVolumeId}>
                  {item.book.title}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className={styles.field}>
          <span className={styles.label}>Book</span>
          {borrowBook ? (
            <div className={styles.selectedBook}>
              {borrowBook.thumbnailUrl && (
                <img className={styles.selectedCover} src={borrowBook.thumbnailUrl} alt="" />
              )}
              <div className={styles.selectedInfo}>
                <strong>{borrowBook.title ?? 'Untitled'}</strong>
                {borrowBook.authors?.length > 0 && <span>{borrowBook.authors.join(', ')}</span>}
              </div>
              <button
                type="button"
                className={styles.changeButton}
                onClick={() => setBorrowBook(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <BookSearch onSelect={setBorrowBook} />
          )}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="loan-counterparty">
          {counterpartyLabel}
        </label>
        <input
          id="loan-counterparty"
          type="text"
          className={styles.input}
          value={counterpartyName}
          onChange={(e) => setCounterpartyName(e.target.value)}
          placeholder="Person’s name"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="loan-loanedOn">
          Loaned on
        </label>
        <input
          id="loan-loanedOn"
          type="date"
          className={styles.input}
          value={loanedOn}
          onChange={(e) => setLoanedOn(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="loan-dueDate">
          Due date <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="loan-dueDate"
          type="date"
          className={styles.input}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="loan-notes">
          Notes <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="loan-notes"
          className={styles.input}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className={styles.save} disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Record loan'}
        </button>
      </div>
    </form>
  );
}
