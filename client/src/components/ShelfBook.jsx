import { memo } from 'react';
import BookCover from './BookCover.jsx';
import styles from './ShelfBook.module.css';

// One book standing on the shelf: the cover IS the card - no caption, just the
// book resting on the board (covers carry their own titles; the modal has the
// rest). Clicking it "takes the book off the shelf" - the whole thing is a
// button that hands the item to the page, which opens BookDetailModal (all the
// info and any actions live there, so the shelf stays covers-forward).
//
// Replaces the old LibraryItemCard. Same reuse story: the owner's page and the
// read-only friend view render the identical component - what differs is what
// the page DOES with onOpen.
//
// Memoized: the pages render hundreds of these inside components that re-render
// on every notice/modal/loan state change. All props are referentially stable
// across those updates (same items array, setState-setter onOpen, literal
// eager), so memo keeps the whole shelf inert to unrelated page state.
//
// Props: item (the joined library shape); onOpen(item); eager - forwarded to
// BookCover for above-the-fold covers.
function ShelfBook({ item, onOpen, eager = false }) {
  const { status, book } = item;

  return (
    <li className={styles.slot}>
      {/* The cover art is decorative (alt="") - the aria-label is the button's
          accessible name, so a screen reader hears the title, not "button". */}
      <button
        type="button"
        className={styles.bookButton}
        onClick={() => onOpen(item)}
        aria-label={book.title}
      >
        {/* In the mixed "All" view, wishlist books get a small marker - they're
            on the shelf you WANT, not the shelf you have. */}
        {status === 'wishlist' && <span className={styles.wishMarker}>Wishlist</span>}
        <BookCover book={book} className={styles.lift} eager={eager} />
      </button>
    </li>
  );
}

export default memo(ShelfBook);
