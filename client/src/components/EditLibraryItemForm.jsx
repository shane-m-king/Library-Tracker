import { useState } from 'react';
import { updateLibraryItem } from '../api/library.js';
import { getErrorMessage } from '../api/apiFetch.js';
import styles from './EditLibraryItemForm.module.css';

// Edit one library entry's personal fields (the catalog book itself is never edited
// here - that's shared, server-owned data). Designed to live inside the Modal.
//
// Two details worth noting:
//   - It sends a PATCH DIFF: only the fields that actually changed, mapping blank
//     inputs to null ("clear this"). That's true PATCH semantics - untouched fields
//     are omitted so the server leaves them alone.
//   - owned -> wishlist ends ownership and clears the book's lent-out loans on the
//     server. We can't see loan state here yet (loans UI is a later step), so we
//     warn and require a second click to confirm, then report what was removed.
//
// Props: item (the entry to edit), onSaved({ loansRemoved }), onCancel.
const RATINGS = [1, 2, 3, 4, 5];

export default function EditLibraryItemForm({ item, onSaved, onCancel }) {
  // Controlled inputs need strings, so nulls become '' (an empty field). On save we
  // map '' back to null where the column is nullable.
  const [form, setForm] = useState({
    status: item.status,
    rating: item.rating == null ? '' : String(item.rating),
    quantity: String(item.quantity),
    notes: item.notes ?? '',
    acquiredDate: item.acquiredDate ?? '',
    acquiredPlace: item.acquiredPlace ?? '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when an owned->wishlist save is pending confirmation (the two-click guard).
  const [awaitingWishlistConfirm, setAwaitingWishlistConfirm] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Moving status back off wishlist cancels any pending warning.
    if (name === 'status') setAwaitingWishlistConfirm(false);
    if (error) setError(null);
  }

  // Compare each field to the original item, collecting only what changed. Blank
  // text/date/rating becomes null (clear); quantity is never nullable.
  function buildChanges() {
    const changes = {};

    if (form.status !== item.status) changes.status = form.status;

    const rating = form.rating === '' ? null : Number(form.rating);
    if (rating !== item.rating) changes.rating = rating;

    const quantity = Number(form.quantity);
    if (quantity !== item.quantity) changes.quantity = quantity;

    const notes = form.notes.trim() === '' ? null : form.notes;
    if (notes !== (item.notes ?? null)) changes.notes = notes;

    const acquiredDate = form.acquiredDate === '' ? null : form.acquiredDate;
    if (acquiredDate !== (item.acquiredDate ?? null)) changes.acquiredDate = acquiredDate;

    const acquiredPlace = form.acquiredPlace.trim() === '' ? null : form.acquiredPlace;
    if (acquiredPlace !== (item.acquiredPlace ?? null)) changes.acquiredPlace = acquiredPlace;

    return changes;
  }

  async function save(changes) {
    setSubmitting(true);
    setError(null);
    try {
      const { loansRemoved } = await updateLibraryItem(item.id, changes);
      onSaved({ loansRemoved });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save changes.'));
      setSubmitting(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    // Guard quantity client-side (the server enforces it too); a number input can
    // still be emptied, which Number() would turn into 0.
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Quantity must be a whole number of at least 1.');
      return;
    }

    const changes = buildChanges();
    if (Object.keys(changes).length === 0) {
      setError('No changes to save.');
      return;
    }

    // owned -> wishlist is destructive (clears lent-out loans): require a 2nd click.
    const becomingWishlist = item.status === 'owned' && changes.status === 'wishlist';
    if (becomingWishlist && !awaitingWishlistConfirm) {
      setAwaitingWishlistConfirm(true);
      return;
    }

    save(changes);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-status">
          Status
        </label>
        <select
          id="edit-status"
          name="status"
          className={styles.input}
          value={form.status}
          onChange={handleChange}
          autoFocus
        >
          <option value="owned">Owned</option>
          <option value="wishlist">Wishlist</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-rating">
          Rating
        </label>
        <select
          id="edit-rating"
          name="rating"
          className={styles.input}
          value={form.rating}
          onChange={handleChange}
        >
          <option value="">No rating</option>
          {RATINGS.map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-quantity">
          Quantity owned
        </label>
        <input
          id="edit-quantity"
          name="quantity"
          type="number"
          min="1"
          step="1"
          className={styles.input}
          value={form.quantity}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-notes">
          Notes
        </label>
        <textarea
          id="edit-notes"
          name="notes"
          className={styles.input}
          rows={3}
          value={form.notes}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-acquiredDate">
          Acquired date
        </label>
        <input
          id="edit-acquiredDate"
          name="acquiredDate"
          type="date"
          className={styles.input}
          value={form.acquiredDate}
          onChange={handleChange}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="edit-acquiredPlace">
          Acquired from
        </label>
        <input
          id="edit-acquiredPlace"
          name="acquiredPlace"
          type="text"
          className={styles.input}
          value={form.acquiredPlace}
          onChange={handleChange}
          placeholder="e.g. a used bookshop"
        />
      </div>

      {awaitingWishlistConfirm && (
        <p className={styles.warning} role="alert">
          Switching to “wishlist” means you no longer own this book. If it’s currently
          lent out, those loan records will be removed. Click <strong>Save</strong>{' '}
          again to confirm.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancel}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className={styles.save} disabled={submitting}>
          {submitting ? 'Saving…' : awaitingWishlistConfirm ? 'Save (confirm)' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
