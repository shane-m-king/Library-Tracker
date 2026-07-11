import Modal from './Modal.jsx';
import Button from './Button.jsx';
import Badge from './Badge.jsx';
import BookCover from './BookCover.jsx';
import { formatDate } from '../lib/dates.js';
import styles from './BookDetailModal.module.css';

// "Taking the book off the shelf": everything about one library item, opened by
// clicking a ShelfBook. All the detail the shelf deliberately doesn't show lives
// here - catalog facts (authors, genres, publication) and the personal record
// (status, rating, copies, notes, where/when acquired).
//
// Edit/Remove are OPTIONAL callbacks, exactly like the old card: the owner's page
// passes them; the friend view omits them and gets a read-only inspector.
//
// Props: item (or null = closed); onClose; onEdit(item) / onDelete(item) optional.
export default function BookDetailModal({ item, onClose, onEdit, onDelete }) {
  return (
    <Modal isOpen={item !== null} onClose={onClose} title={item?.book.title ?? ''}>
      {item && <DetailBody item={item} onEdit={onEdit} onDelete={onDelete} />}
    </Modal>
  );
}

// Split out so the body can destructure freely - it only renders with an item.
function DetailBody({ item, onEdit, onDelete }) {
  const { status, rating, quantity, notes, acquiredDate, acquiredPlace, book } = item;
  // Library items always carry authors/genres arrays (COALESCE'd server-side),
  // but guard anyway so reusing this modal for another book shape (e.g. a
  // loan's book, which has no genres field) can't crash it.
  const authors = book.authors?.length ? book.authors.join(', ') : 'Unknown author';
  const genres = book.genres ?? [];

  // "Publisher, 2011" / "Publisher" / "2011" - whatever the catalog has. Google's
  // publishedDate is sometimes just a year, so only full dates go through formatDate.
  const published = [book.publisher, book.publishedDate?.slice(0, 4)]
    .filter(Boolean)
    .join(', ');

  const acquired = [formatDate(acquiredDate), acquiredPlace].filter(Boolean).join(' · ');

  return (
    <div className={styles.layout}>
      <BookCover book={book} />

      <div className={styles.info}>
        {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
        <p className={styles.authors}>by {authors}</p>

        <div className={styles.meta}>
          <Badge tone={status === 'owned' ? 'neutral' : 'info'}>
            {status === 'owned' ? 'Owned' : 'Wishlist'}
          </Badge>
          {rating != null && (
            <span className={styles.metaItem} aria-label={`Rated ${rating} out of 5`}>
              ★ {rating}/5
            </span>
          )}
          {quantity > 1 && <span className={styles.metaItem}>×{quantity} copies</span>}
        </div>

        {/* Catalog facts - each line renders only when the catalog has it. */}
        <dl className={styles.facts}>
          {genres.length > 0 && (
            <div className={styles.fact}>
              <dt>Genres</dt>
              <dd>{genres.join(' · ')}</dd>
            </div>
          )}
          {published && (
            <div className={styles.fact}>
              <dt>Published</dt>
              <dd>{published}</dd>
            </div>
          )}
          {book.pageCount != null && (
            <div className={styles.fact}>
              <dt>Pages</dt>
              <dd>{book.pageCount}</dd>
            </div>
          )}
          {acquired && (
            <div className={styles.fact}>
              <dt>Acquired</dt>
              <dd>{acquired}</dd>
            </div>
          )}
        </dl>

        {notes && <p className={styles.notes}>{notes}</p>}

        {(onEdit || onDelete) && (
          <div className={styles.actions}>
            {onEdit && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(item)}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="dangerOutline" size="sm" onClick={() => onDelete(item)}>
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
