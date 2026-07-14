import styles from './BookCover.module.css';

// A book's front cover at shelf size: the real Google Books art when we have it,
// otherwise a CSS "cloth-bound" stand-in with the title embossed on it. Purely
// presentational, and deliberately DECORATIVE to assistive tech (alt="") - every
// place a cover renders names the book in text or a label right beside it (the
// shelf buttons' aria-labels, the detail modals' headings), so a screen reader
// shouldn't hear the title twice.
//
// Props: book (uses title, authors, thumbnailUrl); className is appended to the
// wrapper so a parent can hook effects onto it (e.g. ShelfBook's hover lift)
// without reaching into this module's classes; eager opts a cover out of lazy
// loading - pass it for above-the-fold covers (the shelf's first row is the
// page's likely LCP element, and lazy-loading the LCP image delays it);
// natural lets real art keep its own proportions instead of being trimmed to
// the shelf's uniform 2:3 - pass it in detail views, where the point is to
// see the actual cover (shelves never pass it: equal heights beat exactness
// there, like real books in a row).

// Coverless books get a cloth colour picked deterministically from the title, so
// the same book is always "bound" the same way but a shelf of them varies.
const CLOTH_TONES = [styles.toneGreen, styles.toneOxblood, styles.toneNavy, styles.toneBrown];

function clothToneOf(title) {
  let sum = 0;
  for (const char of title) sum += char.codePointAt(0);
  return CLOTH_TONES[sum % CLOTH_TONES.length];
}

export default function BookCover({ book, className = '', eager = false, natural = false }) {
  // Library items always have a title (NOT NULL in the DB), but Google search
  // results occasionally don't - don't let a null crash the tone hash. Same
  // defence for authors: every current caller supplies an array, but this
  // component shouldn't be one partial book object away from crashing a shelf.
  const title = book.title ?? 'Untitled';
  const firstAuthor = book.authors?.[0];

  // natural only applies to real art - the cloth stand-in is generated, has no
  // "true" shape, and keeps its 2:3 binding everywhere.
  const classes = [styles.book, natural && book.thumbnailUrl && styles.natural, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {book.thumbnailUrl ? (
        <img
          className={styles.art}
          src={book.thumbnailUrl}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
        />
      ) : (
        <span className={`${styles.cloth} ${clothToneOf(title)}`} aria-hidden="true">
          <span className={styles.clothTitle}>{title}</span>
          {firstAuthor && <span className={styles.clothAuthor}>{firstAuthor}</span>}
          <span className={styles.clothEmblem}>❧</span>
        </span>
      )}
      {/* One overlay gives BOTH variants the same physical presence: a light
          sheen, a brass hairline, and a spine shadow down the left edge. */}
      <span className={styles.sheen} aria-hidden="true" />
    </span>
  );
}
