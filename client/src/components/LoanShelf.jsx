import { useState } from 'react';
import BookCover from './BookCover.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { isOverdue } from '../lib/loans.js';
// shared = app-wide knob + srOnly; shelfBook = the button + hover-lift pair
// (ShelfBook's real classes, so its hover rule fires here); styles = local.
import shared from './shelfShared.module.css';
import shelfBook from './ShelfBook.module.css';
import styles from './LoanShelf.module.css';

// A thin, covers-only shelf for ONE direction of loans (lent out / borrowed):
// small covers standing on a single board, paged with the same brass knobs as
// the bookcase when more than a caseful. The cover IS the whole entry -
// clicking hands the loan to the page, which opens LoanDetailModal (all info
// and actions live there, same "take it off the shelf" pattern as the
// collection).
//
// Overdue is the one status that must be readable without clicking - it gets
// a small chip on the cover, like the collection's Wishlist marker.
//
// Same paging rules as Bookshelf: internal page state, clamped at RENDER time
// so a shrinking list can never point past the end; capacity must match the
// module's 600px breakpoint (CSS draws the columns, this fills them).
//
// Props: loans (one direction, one view), onOpen(loan).
export default function LoanShelf({ loans, onOpen }) {
  const isNarrow = useMediaQuery('(max-width: 600px)');
  const perPage = isNarrow ? 4 : 6;

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(loans.length / perPage));
  const current = Math.min(page, pageCount - 1);
  const visible = loans.slice(current * perPage, (current + 1) * perPage);
  const paged = pageCount > 1;

  return (
    <div className={styles.shelf}>
      {paged && (
        <button
          type="button"
          className={`${shared.knob} ${styles.arrow}`}
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          aria-label="Previous loans"
        >
          ‹
        </button>
      )}

      <div className={styles.rowWrap}>
        <ul className={styles.row}>
          {visible.map((loan) => {
            const overdue = isOverdue(loan);
            const who =
              loan.direction === 'lent_out'
                ? `lent to ${loan.counterpartyName}`
                : `borrowed from ${loan.counterpartyName}`;
            return (
              <li key={loan.id} className={styles.slot}>
                {/* The cover art is decorative (alt="") - the aria-label names
                    the loan: title, who has it, and overdue if it is. */}
                <button
                  type="button"
                  className={shelfBook.bookButton}
                  onClick={() => onOpen(loan)}
                  aria-label={`${loan.book.title ?? 'Untitled'} — ${who}${overdue ? ', overdue' : ''}`}
                >
                  {overdue && <span className={styles.overdueMarker}>Overdue</span>}
                  <BookCover book={loan.book} className={shelfBook.lift} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.board} />
      </div>

      {paged && (
        <button
          type="button"
          className={`${shared.knob} ${styles.arrow}`}
          onClick={() => setPage(current + 1)}
          disabled={current === pageCount - 1}
          aria-label="Next loans"
        >
          ›
        </button>
      )}

      {/* Page turns swap the covers silently otherwise; announce them. Unlike
          the bookcase's visible pill, this one is screen-reader-only - the
          loans area is fighting for vertical space by design. */}
      {paged && (
        <p className={shared.srOnly} aria-live="polite">
          Page {current + 1} of {pageCount}
        </p>
      )}

      {/* Sighted users see a bare board; screen readers skip an empty <ul>
          silently, so say it in words here. */}
      {loans.length === 0 && <p className={shared.srOnly}>Nothing on this shelf.</p>}
    </div>
  );
}
