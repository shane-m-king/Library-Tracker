import { useState } from 'react';
import { updateLoan } from '../api/loans.js';
import { getErrorMessage } from '../api/apiFetch.js';
import styles from './EditLoanForm.module.css';

// Edit one loan's mutable fields. The book and direction define the loan and aren't
// editable here (changing them would make it a different loan), so they show as
// read-only context at the top. Designed to live inside the Modal.
//
// Like EditLibraryItemForm, it sends a PATCH DIFF: only the fields that actually
// changed, mapping blank inputs to null ("clear this"). Two loan-specific notes:
//   - counterpartyName is NOT NULL: it must stay a non-empty string.
//   - returnedOn doubles as the returned flag - set a date to mark the loan returned,
//     or clear it to reopen an active loan. (The card's one-click "Mark returned" is
//     the quick path; this is for corrections.)
//
// Props: loan (the entry to edit), onSaved(), onCancel.
export default function EditLoanForm({ loan, onSaved, onCancel }) {
  // Controlled inputs need strings, so nulls become '' (an empty field). On save we
  // map '' back to null where the column is nullable.
  const [form, setForm] = useState({
    counterpartyName: loan.counterpartyName,
    dueDate: loan.dueDate ?? '',
    returnedOn: loan.returnedOn ?? '',
    notes: loan.notes ?? '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  }

  // Compare each field to the original loan, collecting only what changed. Blank
  // due/returned dates and notes become null (clear); counterpartyName is never null.
  function buildChanges() {
    const changes = {};

    const counterpartyName = form.counterpartyName.trim();
    if (counterpartyName !== loan.counterpartyName) changes.counterpartyName = counterpartyName;

    const dueDate = form.dueDate === '' ? null : form.dueDate;
    if (dueDate !== (loan.dueDate ?? null)) changes.dueDate = dueDate;

    const returnedOn = form.returnedOn === '' ? null : form.returnedOn;
    if (returnedOn !== (loan.returnedOn ?? null)) changes.returnedOn = returnedOn;

    const notes = form.notes.trim() === '' ? null : form.notes;
    if (notes !== (loan.notes ?? null)) changes.notes = notes;

    return changes;
  }

  async function save(changes) {
    setSubmitting(true);
    setError(null);
    try {
      await updateLoan(loan.id, changes);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save changes.'));
      setSubmitting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    // counterpartyName is required and can't be blanked (it's NOT NULL server-side).
    if (form.counterpartyName.trim() === '') {
      setError('Enter who the book is with.');
      return;
    }

    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      setError('No changes to save.');
      return;
    }

    save(changes);
  }

  const counterpartyLabel = loan.direction === 'lent_out' ? 'Lent to' : 'Borrowed from';

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Read-only context: which loan this is. */}
      <p className={styles.context}>
        <strong>{loan.book.title}</strong>
        <span>{loan.direction === 'lent_out' ? 'Lent out' : 'Borrowed'}</span>
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-loan-counterparty">
          {counterpartyLabel}
        </label>
        <input
          id="edit-loan-counterparty"
          name="counterpartyName"
          type="text"
          className={styles.input}
          value={form.counterpartyName}
          onChange={handleChange}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-loan-dueDate">
          Due date <span className={styles.optional}>(optional)</span>
        </label>
        <input
          id="edit-loan-dueDate"
          name="dueDate"
          type="date"
          className={styles.input}
          value={form.dueDate}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-loan-returnedOn">
          Returned on <span className={styles.optional}>(leave blank if not returned)</span>
        </label>
        <input
          id="edit-loan-returnedOn"
          name="returnedOn"
          type="date"
          className={styles.input}
          value={form.returnedOn}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-loan-notes">
          Notes <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          id="edit-loan-notes"
          name="notes"
          className={styles.input}
          rows={2}
          value={form.notes}
          onChange={handleChange}
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
        <button type="submit" className={styles.save} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
