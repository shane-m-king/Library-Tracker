import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query, withTransaction } from '../db.js';
import { getVolume } from '../services/googleBooks.js';

const router = Router();

const VALID_STATUSES = ['owned', 'wishlist'];

// The only fields a PATCH may change, mapped from their API name to their DB
// column. Anything else in the request body is ignored. Whitelisting like this
// does double duty: it blocks mass-assignment (a client can't sneak in user_id,
// book_id, etc.), and it's what keeps the dynamic UPDATE below injection-safe -
// column names come from THIS object, never from user input.
const EDITABLE_FIELDS = {
  status: 'status',
  rating: 'rating',
  notes: 'notes',
  acquiredDate: 'acquired_date',
  acquiredPlace: 'acquired_place',
};

// Shape one joined DB row into the API's response contract: the user's personal
// fields at the top level, with the shared catalog data nested under `book`.
// Keeping this mapping explicit means our column names aren't leaked straight to
// clients - the API shape is something we choose on purpose.
function toLibraryItem(row) {
  return {
    id: row.id,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    acquiredDate: row.acquired_date,
    acquiredPlace: row.acquired_place,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    book: {
      id: row.book_id,
      googleVolumeId: row.google_volume_id,
      title: row.title,
      subtitle: row.subtitle,
      authors: row.authors,
      genres: row.genres,
      publishedDate: row.published_date,
      pageCount: row.page_count,
      isbn10: row.isbn_10,
      isbn13: row.isbn_13,
      publisher: row.publisher,
      thumbnailUrl: row.thumbnail_url,
      smallThumbnailUrl: row.small_thumbnail_url,
    },
  };
}

// POST /api/library
// Add a book to the logged-in user's collection.
//
// The client sends only the googleVolumeId (plus their own personal fields). The
// SERVER is the source of truth for catalog data, so when a book isn't cached yet
// we fetch the authoritative record from Google ourselves rather than trusting
// whatever the client sends. Caching the book + its authors + its genres, and
// creating the user_books row, all happen inside ONE transaction: it either fully
// succeeds or fully rolls back, so we can never end up with a half-cached book.
router.post('/', requireAuth, async (req, res) => {
  const { googleVolumeId, status, rating, notes, acquiredDate, acquiredPlace } =
    req.body ?? {};

  // --- Validate the request ---
  if (!googleVolumeId) {
    return res.status(400).json({ error: 'googleVolumeId is required' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "status must be 'owned' or 'wishlist'" });
  }
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
  }

  try {
    // Is this book already in our shared catalog? Cheap pre-check so we only call
    // Google the FIRST time anyone adds this particular book; afterwards it's cached.
    const cached = await query(
      'SELECT id FROM books WHERE google_volume_id = $1',
      [googleVolumeId]
    );
    let bookId = cached.rows[0]?.id ?? null;

    // Not cached yet -> fetch the authoritative volume from Google. We do this
    // BEFORE opening the transaction: never hold a DB transaction open across a
    // slow network call.
    let volume = null;
    if (!bookId) {
      volume = await getVolume(googleVolumeId);
    }

    const userBook = await withTransaction(async (client) => {
      // 1. Cache the book if it's new. ON CONFLICT keeps this safe even if another
      //    request inserted it between our pre-check and now. The "DO UPDATE ... =
      //    EXCLUDED" is a deliberate no-op whose only purpose is to make RETURNING
      //    fire on conflict (DO NOTHING would hand back zero rows).
      if (!bookId) {
        const inserted = await client.query(
          `INSERT INTO books
             (google_volume_id, title, subtitle, description, publisher,
              published_date, page_count, isbn_10, isbn_13,
              thumbnail_url, small_thumbnail_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (google_volume_id)
             DO UPDATE SET google_volume_id = EXCLUDED.google_volume_id
           RETURNING id`,
          [
            volume.googleVolumeId, volume.title, volume.subtitle, volume.description,
            volume.publisher, volume.publishedDate, volume.pageCount,
            volume.isbn10, volume.isbn13, volume.thumbnailUrl, volume.smallThumbnailUrl,
          ]
        );
        bookId = inserted.rows[0].id;

        // 2. Authors: upsert each name into the lookup table, then link it to the
        //    book, preserving author order via `position`.
        for (let i = 0; i < volume.authors.length; i++) {
          const author = await client.query(
            `INSERT INTO authors (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [volume.authors[i]]
          );
          await client.query(
            `INSERT INTO book_authors (book_id, author_id, position)
             VALUES ($1, $2, $3)
             ON CONFLICT (book_id, author_id) DO NOTHING`,
            [bookId, author.rows[0].id, i + 1]
          );
        }

        // 3. Genres: same upsert-then-link, no ordering to preserve.
        for (const name of volume.categories) {
          const genre = await client.query(
            `INSERT INTO genres (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [name]
          );
          await client.query(
            `INSERT INTO book_genres (book_id, genre_id)
             VALUES ($1, $2)
             ON CONFLICT (book_id, genre_id) DO NOTHING`,
            [bookId, genre.rows[0].id]
          );
        }
      }

      // 4. Finally, create THIS user's relationship to the book.
      const result = await client.query(
        `INSERT INTO user_books
           (user_id, book_id, status, rating, notes, acquired_date, acquired_place)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, book_id, status, rating, notes,
                   acquired_date, acquired_place, created_at, updated_at`,
        [
          req.userId, bookId, status, rating ?? null, notes ?? null,
          acquiredDate ?? null, acquiredPlace ?? null,
        ]
      );
      return result.rows[0];
    });

    return res.status(201).json({ item: userBook });
  } catch (err) {
    // The user already has this book (UNIQUE(user_id, book_id)). 23505 = unique_violation.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'this book is already in your library' });
    }
    // err.status is set by the Google Books service when the upstream call fails.
    if (err.status) {
      const message =
        err.status === 429
          ? 'Google Books rate limit reached. Try again shortly.'
          : 'could not fetch that book from Google Books';
      return res.status(502).json({ error: message });
    }
    console.error('Adding book to library failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/library
// List the logged-in user's collection, newest first. Optional ?status= filter
// (owned | wishlist). Each item joins the user_books row to its catalog book and
// re-collapses the book's authors and genres back into arrays.
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;

  if (status != null && !VALID_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: "status filter must be 'owned' or 'wishlist'" });
  }

  try {
    // Authors and genres are each a one-to-many off the book. If we JOINed both
    // in directly, a book with 1 author and 3 genres would fan out into 3 rows
    // (and 2 authors x 3 genres -> 6), corrupting our aggregates. Instead we build
    // each array in its own correlated subquery, so they're computed independently
    // and never multiply against each other. COALESCE(..., '{}') yields an empty
    // array (not NULL) when a book has no authors/genres.
    //
    // acquired_date is cast to text so it serializes as a plain 'YYYY-MM-DD'
    // string; left as a DATE, the pg driver hands back a JS Date that can shift by
    // a day across timezones when converted to JSON.
    //
    // The ($2 IS NULL OR ub.status = $2) trick makes the status filter optional
    // within a single query: pass the status to filter, or null for "all".
    const result = await query(
      `SELECT
         ub.id, ub.status, ub.rating, ub.notes,
         ub.acquired_date::text AS acquired_date, ub.acquired_place,
         ub.created_at, ub.updated_at,
         b.id AS book_id, b.google_volume_id, b.title, b.subtitle,
         b.published_date, b.page_count, b.isbn_10, b.isbn_13, b.publisher,
         b.thumbnail_url, b.small_thumbnail_url,
         COALESCE(
           (SELECT array_agg(a.name ORDER BY ba.position)
              FROM book_authors ba JOIN authors a ON a.id = ba.author_id
             WHERE ba.book_id = b.id),
           '{}'
         ) AS authors,
         COALESCE(
           (SELECT array_agg(g.name ORDER BY g.name)
              FROM book_genres bg JOIN genres g ON g.id = bg.genre_id
             WHERE bg.book_id = b.id),
           '{}'
         ) AS genres
       FROM user_books ub
       JOIN books b ON b.id = ub.book_id
       WHERE ub.user_id = $1
         AND ($2::text IS NULL OR ub.status = $2)
       ORDER BY ub.created_at DESC`,
      [req.userId, status ?? null]
    );

    return res.json({ items: result.rows.map(toLibraryItem) });
  } catch (err) {
    console.error('Listing library failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// PATCH /api/library/:id
// Partially update one library entry. PATCH semantics: only the fields the client
// actually sends are touched. We deliberately distinguish "key omitted" (leave it
// as-is) from "key sent as null" (explicitly clear it) - that's the core
// difference between a PATCH and a full-replacement PUT.
router.patch('/:id', requireAuth, async (req, res) => {
  // The id addresses a row by its surrogate key, which is a BIGINT. Reject a
  // non-numeric id up front so it can't reach Postgres and blow up as a type error.
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'library entry not found' });
  }

  const body = req.body ?? {};
  const sets = [];
  const values = [];

  // Build the SET clause from only the editable fields that are actually present.
  for (const [field, column] of Object.entries(EDITABLE_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue; // omitted -> leave alone
    const value = body[field];

    // Per-field validation.
    if (field === 'status' && !VALID_STATUSES.includes(value)) {
      return res.status(400).json({ error: "status must be 'owned' or 'wishlist'" });
    }
    if (
      field === 'rating' &&
      value !== null &&
      (!Number.isInteger(value) || value < 1 || value > 5)
    ) {
      return res
        .status(400)
        .json({ error: 'rating must be an integer from 1 to 5, or null to clear' });
    }
    if (
      (field === 'notes' || field === 'acquiredPlace') &&
      value !== null &&
      typeof value !== 'string'
    ) {
      return res.status(400).json({ error: `${field} must be a string or null` });
    }

    values.push(value);
    sets.push(`${column} = $${values.length}`); // $1, $2, ... in insertion order
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }

  // Always bump updated_at. Postgres won't do this on its own - the column's
  // DEFAULT now() only fires on INSERT, not UPDATE. (A BEFORE UPDATE trigger could
  // automate it; setting it explicitly is simpler and keeps the behavior visible.)
  sets.push('updated_at = now()');

  // id and user_id go on the end as the WHERE params. Scoping to user_id is the
  // authorization check: a user can only ever change their OWN rows. A row owned
  // by someone else simply doesn't match -> 404, which also avoids confirming the
  // row exists at all.
  values.push(req.params.id, req.userId);
  const idPlaceholder = `$${values.length - 1}`;
  const userPlaceholder = `$${values.length}`;

  try {
    const result = await query(
      `UPDATE user_books
          SET ${sets.join(', ')}
        WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}
        RETURNING id, user_id, book_id, status, rating, notes,
                  acquired_date::text AS acquired_date, acquired_place,
                  created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'library entry not found' });
    }
    return res.json({ item: result.rows[0] });
  } catch (err) {
    // A malformed acquiredDate reaches Postgres as an invalid date value.
    if (err.code === '22007' || err.code === '22008') {
      return res
        .status(400)
        .json({ error: 'acquiredDate must be a valid date (YYYY-MM-DD)' });
    }
    console.error('Updating library entry failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// DELETE /api/library/:id
// Remove a book from the user's collection. If they also have loan records for
// that same book (e.g. they'd lent it out), those are removed too: once the book
// is gone from your library, any loan tied to it is orphaned. loans and user_books
// are sibling tables with no FK between them, so the DB won't cascade this for us -
// we delete from both inside ONE transaction so they succeed or fail together.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'library entry not found' });
  }

  try {
    const outcome = await withTransaction(async (client) => {
      // Remove the library entry, scoped to its owner. RETURNING book_id does two
      // jobs: it confirms a row was actually deleted (so it was ours), and it tells
      // us which catalog book to clean up loans for.
      const removed = await client.query(
        `DELETE FROM user_books
          WHERE id = $1 AND user_id = $2
          RETURNING book_id`,
        [req.params.id, req.userId]
      );

      if (removed.rowCount === 0) {
        return null; // nothing matched -> the COMMIT is a harmless no-op
      }

      const { book_id } = removed.rows[0];

      // Clear this user's loan records for that book (both lent-out and borrowed).
      const loans = await client.query(
        `DELETE FROM loans
          WHERE user_id = $1 AND book_id = $2`,
        [req.userId, book_id]
      );

      return { loansRemoved: loans.rowCount };
    });

    if (outcome === null) {
      return res.status(404).json({ error: 'library entry not found' });
    }
    return res.json({ ok: true, loansRemoved: outcome.loansRemoved });
  } catch (err) {
    console.error('Deleting library entry failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

export default router;
