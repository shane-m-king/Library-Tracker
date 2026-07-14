import { useState } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
// shared = the app-wide knob + srOnly recipes; styles places them on THIS case.
import shared from './shelfShared.module.css';
import styles from './Bookshelf.module.css';

// The bookcase (mockup v6, made real): a framed case - crown, side posts,
// base - holding two shelves of five slots each (three on phones). The
// shelves keep their resident decor: plant | books | twin candles on top,
// candle | books | plant below. Because the slot count is fixed, a short
// shelf reads as free space on the same furniture, not a reflowed grid.
//
// Pagination: the case shows one caseful at a time; when the library holds
// more, small brass knobs on the side posts page through it. The page is
// internal state - remount to reset it (the pages pass key={filter} so a
// filter change starts back at the first caseful). It's CLAMPED at render
// time rather than synced with an effect, so a delete or resize that shrinks
// the list can never leave us pointing past the last page.
//
// API: `items` (the full list) + `renderBook(item, index)` - Bookshelf owns
// WHICH items are on the case and the furniture around them; the caller owns
// what a book is and what clicking it does (ShelfBook wired to the page's
// modal).
//
// The decor is drawn in CSS, ported from the mockup, and aria-hidden: a
// screen reader hears two lists of books, the paging controls, and no
// furniture.

function Plant() {
  return (
    <span className={styles.plant} aria-hidden="true">
      <span className={styles.pleaf} />
      <span className={styles.pleaf} />
      <span className={styles.pleaf} />
      <span className={styles.pleaf} />
      <span className={styles.pot} />
    </span>
  );
}

function Candle({ short = false }) {
  return (
    <span
      className={short ? `${styles.candle} ${styles.short}` : styles.candle}
      aria-hidden="true"
    >
      <span className={styles.flame} />
      <span className={styles.drip} />
      <span className={styles.wax} />
      <span className={styles.holder} />
    </span>
  );
}

export default function Bookshelf({ items, renderBook }) {
  // MUST match the module's 600px breakpoint: the CSS decides how many slot
  // columns a shelf DRAWS, this decides how many books a shelf HOLDS.
  const isNarrow = useMediaQuery('(max-width: 600px)');
  const perShelf = isNarrow ? 3 : 5;
  const pageSize = perShelf * 2; // two shelves

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1); // render-time clamp (see above)

  const start = current * pageSize;
  const visible = items.slice(start, start + pageSize);
  const topShelf = visible.slice(0, perShelf);
  const bottomShelf = visible.slice(perShelf);

  const paged = pageCount > 1;

  return (
    <div className={styles.bookcase}>
      {/* The knobs sit ON the posts (styled there) but flank the shelves in
          the DOM, so the tab order walks prev -> books -> next. Disabled at
          the ends: a knob that stays put but won't turn beats one that
          vanishes underfoot. */}
      {paged && (
        <button
          type="button"
          className={`${shared.knob} ${styles.arrow} ${styles.arrowLeft}`}
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          aria-label="Previous shelf page"
        >
          ‹
        </button>
      )}

      <div className={styles.crown} />
      <div className={styles.caseBody}>
        <span className={styles.postLeft} aria-hidden="true" />
        <span className={styles.postRight} aria-hidden="true" />

        {/* Top shelf: plant | books | twin candles. */}
        <div className={styles.shelfUnit}>
          <div className={styles.books}>
            <span className={styles.end}>
              <Plant />
            </span>
            <ul className={styles.stack}>{topShelf.map((item, i) => renderBook(item, i))}</ul>
            <span className={`${styles.end} ${styles.twin}`}>
              <Candle short />
              <Candle />
            </span>
          </div>
          <div className={styles.board} />
        </div>

        {/* Bottom shelf: candle | books | plant. */}
        <div className={styles.shelfUnit}>
          <div className={styles.books}>
            <span className={styles.end}>
              <Candle />
            </span>
            <ul className={styles.stack}>
              {bottomShelf.map((item, i) => renderBook(item, i + perShelf))}
            </ul>
            <span className={styles.end}>
              <Plant />
            </span>
          </div>
          <div className={styles.board} />
        </div>
      </div>
      <div className={styles.base} />

      {paged && (
        <button
          type="button"
          className={`${shared.knob} ${styles.arrow} ${styles.arrowRight}`}
          onClick={() => setPage(current + 1)}
          disabled={current === pageCount - 1}
          aria-label="Next shelf page"
        >
          ›
        </button>
      )}

      {/* Where am I? Doubles as the screen-reader announcement on page turns
          (aria-live), since the shelf contents swapping out is otherwise
          silent. */}
      {paged && (
        <p className={styles.pageStatus} aria-live="polite">
          Shelf {current + 1} of {pageCount}
        </p>
      )}

      {/* Sighted users see bare shelves; screen readers skip an empty <ul>
          silently, so say it in words here. */}
      {items.length === 0 && <p className={shared.srOnly}>The shelf is empty.</p>}
    </div>
  );
}
