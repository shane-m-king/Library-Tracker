import { todayIso } from '../lib/dates.js';
import styles from './LoanCard.module.css';

// One loan in a list: cover, the book's identity, who it's with, the relevant dates,
// and status pills (lent-out vs borrowed, and active / returned / overdue). It renders
// a single loan item - the joined shape from getLoanItems (loan fields on top, the
// catalog book nested under `book`).
//
// Intentionally presentational: it takes a `loan` and draws it, with no fetching of
// its own. The actions are OPTIONAL callbacks (same pattern as LibraryItemCard) so
// the card can also serve a read-only context later. onMarkReturned is shown only on
// an ACTIVE loan, since a returned one has nothing to return.
//
// Props: loan; onMarkReturned(loan), onEdit(loan), onDelete(loan) - all optional.
export default function LoanCard({ loan, onMarkReturned, onEdit, onDelete }) {
  const { direction, counterpartyName, loanedOn, dueDate, returnedOn, active, notes, book } = loan;
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';

  // Dates come back as plain 'YYYY-MM-DD' strings, which compare correctly as strings,
  // so an active loan whose due date is before today (in the user's own timezone) is
  // overdue. (A returned loan is never overdue, however late it came back - it's back.)
  const overdue = active && dueDate != null && dueDate < todayIso();

  const relationship =
    direction === 'lent_out'
      ? `Lent to ${counterpartyName}`
      : `Borrowed from ${counterpartyName}`;

  return (
    <li className={styles.card}>
      {book.thumbnailUrl ? (
        <img
          className={styles.cover}
          src={book.thumbnailUrl}
          alt={`Cover of ${book.title}`}
          loading="lazy"
        />
      ) : (
        <div className={styles.coverFallback} aria-hidden="true">
          No cover
        </div>
      )}

      <div className={styles.body}>
        <h2 className={styles.title}>{book.title}</h2>
        {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
        <p className={styles.authors}>by {authors}</p>

        <p className={styles.relationship}>{relationship}</p>

        <div className={styles.meta}>
          <span
            className={`${styles.badge} ${
              direction === 'lent_out' ? styles.badgeLent : styles.badgeBorrowed
            }`}
          >
            {direction === 'lent_out' ? 'Lent out' : 'Borrowed'}
          </span>

          {/* One status pill: overdue takes precedence over plain active. */}
          {active ? (
            <span className={`${styles.badge} ${overdue ? styles.badgeOverdue : styles.badgeActive}`}>
              {overdue ? 'Overdue' : 'Active'}
            </span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeReturned}`}>Returned</span>
          )}
        </div>

        <div className={styles.dates}>
          <span>Loaned {loanedOn}</span>
          {dueDate && (
            <span className={overdue ? styles.overdueText : undefined}>Due {dueDate}</span>
          )}
          {returnedOn && <span>Returned {returnedOn}</span>}
        </div>

        {notes && <p className={styles.notes}>{notes}</p>}

        {(onMarkReturned || onEdit || onDelete) && (
          <div className={styles.cardActions}>
            {active && onMarkReturned && (
              <button
                type="button"
                className={styles.returnButton}
                onClick={() => onMarkReturned(loan)}
              >
                Mark returned
              </button>
            )}
            {onEdit && (
              <button type="button" className={styles.editButton} onClick={() => onEdit(loan)}>
                Edit
              </button>
            )}
            {onDelete && (
              <button type="button" className={styles.removeButton} onClick={() => onDelete(loan)}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
