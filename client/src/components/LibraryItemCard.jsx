import styles from './LibraryItemCard.module.css';

// One book in a library list: cover, title/subtitle, authors, and a row of meta
// (owned/wishlist status, rating, quantity). It renders a single library item -
// the joined shape from getLibraryItems (personal fields at the top, catalog data
// nested under `book`).
//
// It's intentionally presentational: it takes an `item` and draws it, with no data
// fetching of its own. Edit/delete are OPTIONAL callbacks - when omitted (e.g. a
// read-only view of a friend's library in Step 7) the controls simply don't render,
// so the same component serves both the owner and a viewer.
//
// Props: item; onEdit(item) and onDelete(item) - optional.
export default function LibraryItemCard({ item, onEdit, onDelete }) {
  const { status, rating, quantity, book } = item;
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';

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
        // No cover from Google: a labelled placeholder keeps the layout aligned.
        // aria-hidden because the title sits right beside it - a screen reader
        // doesn't need "no cover" read out.
        <div className={styles.coverFallback} aria-hidden="true">
          No cover
        </div>
      )}

      <div className={styles.body}>
        <h2 className={styles.title}>{book.title}</h2>
        {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
        <p className={styles.authors}>by {authors}</p>

        <div className={styles.meta}>
          <span
            className={`${styles.badge} ${
              status === 'owned' ? styles.badgeOwned : styles.badgeWishlist
            }`}
          >
            {status === 'owned' ? 'Owned' : 'Wishlist'}
          </span>

          {/* rating is nullable; only show it when set. */}
          {rating != null && (
            <span className={styles.rating} aria-label={`Rated ${rating} out of 5`}>
              ★ {rating}/5
            </span>
          )}

          {/* Only worth showing when you own more than one copy. */}
          {quantity > 1 && <span className={styles.quantity}>×{quantity}</span>}
        </div>

        {(onEdit || onDelete) && (
          <div className={styles.cardActions}>
            {onEdit && (
              <button type="button" className={styles.editButton} onClick={() => onEdit(item)}>
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onDelete(item)}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
