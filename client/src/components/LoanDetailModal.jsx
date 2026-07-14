import Modal from './Modal.jsx';
import Button from './Button.jsx';
import Badge from './Badge.jsx';
import BookCover from './BookCover.jsx';
import { formatDate } from '../lib/dates.js';
import { isOverdue } from '../lib/loans.js';
// The structural layout is detailModal.module.css, shared with BookDetailModal
// by importing it directly (see its header); styles holds the loan-only bits.
import shared from './detailModal.module.css';
import styles from './LoanDetailModal.module.css';

// "Taking the loan off the shelf": everything about one loan, opened by
// clicking a cover on a LoanShelf. BookDetailModal's sibling - same layout,
// but the record here is the TRANSACTION: who has the book, the dates, and
// the actions (Mark returned / Edit / Remove) that used to crowd the old
// LoanCard.
//
// The actions are OPTIONAL callbacks, like BookDetailModal's - omit them and
// this renders as a read-only inspector. Mark returned only offers itself on
// an active loan (a returned one has nothing to return).
//
// returnFocusRef is forwarded to Modal: Mark returned removes the triggering
// cover from the Current shelf, so closing must land focus on a stable
// landmark (the page heading), never a maybe-doomed element.
//
// Props: loan (or null = closed); onClose; returnFocusRef;
// onMarkReturned(loan) / onEdit(loan) / onDelete(loan) optional.
export default function LoanDetailModal({
  loan,
  onClose,
  returnFocusRef,
  onMarkReturned,
  onEdit,
  onDelete,
}) {
  return (
    <Modal
      isOpen={loan !== null}
      onClose={onClose}
      title={loan?.book.title ?? ''}
      returnFocusRef={returnFocusRef}
    >
      {loan && (
        <DetailBody
          loan={loan}
          onMarkReturned={onMarkReturned}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </Modal>
  );
}

// Split out so the body can destructure freely - it only renders with a loan.
function DetailBody({ loan, onMarkReturned, onEdit, onDelete }) {
  const { direction, counterpartyName, loanedOn, dueDate, returnedOn, active, notes, book } =
    loan;
  // Loan books come from the shared catalog and always carry authors, but
  // guard like BookDetailModal does - one partial shape shouldn't crash it.
  const authors = book.authors?.length ? book.authors.join(', ') : 'Unknown author';
  const overdue = isOverdue(loan);

  const relationship =
    direction === 'lent_out'
      ? `Lent to ${counterpartyName}`
      : `Borrowed from ${counterpartyName}`;

  return (
    <div className={shared.layout}>
      {/* natural: detail views show the real cover untrimmed (same as
          BookDetailModal - shared.layout is the same class, so the
          stretch-defusing align-items applies here too). */}
      <BookCover book={book} natural />

      <div className={shared.info}>
        {book.subtitle && <p className={shared.subtitle}>{book.subtitle}</p>}
        <p className={shared.authors}>by {authors}</p>

        {/* The loan's headline fact: who has it. Full text weight - it's the
            reason this record exists. */}
        <p className={styles.relationship}>{relationship}</p>

        <div className={shared.meta}>
          <Badge tone={direction === 'lent_out' ? 'warning' : 'info'}>
            {direction === 'lent_out' ? 'Lent out' : 'Borrowed'}
          </Badge>
          {/* One status pill: overdue takes precedence over plain active. */}
          {active ? (
            <Badge tone={overdue ? 'danger' : 'success'}>
              {overdue ? 'Overdue' : 'Active'}
            </Badge>
          ) : (
            <Badge tone="neutral">Returned</Badge>
          )}
        </div>

        <dl className={shared.facts}>
          <div className={shared.fact}>
            <dt>Loaned</dt>
            <dd>{formatDate(loanedOn)}</dd>
          </div>
          {dueDate && (
            <div className={shared.fact}>
              <dt>Due</dt>
              <dd className={overdue ? styles.overdueText : undefined}>
                {formatDate(dueDate)}
              </dd>
            </div>
          )}
          {returnedOn && (
            <div className={shared.fact}>
              <dt>Returned</dt>
              <dd>{formatDate(returnedOn)}</dd>
            </div>
          )}
        </dl>

        {notes && <p className={shared.notes}>{notes}</p>}

        {(onMarkReturned || onEdit || onDelete) && (
          <div className={shared.actions}>
            {active && onMarkReturned && (
              <Button variant="primary" size="sm" onClick={() => onMarkReturned(loan)}>
                Mark returned
              </Button>
            )}
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(loan)}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="dangerOutline" size="sm" onClick={() => onDelete(loan)}>
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
