import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query, withTransaction } from '../db.js';
import { resolveBook, cacheBook } from '../services/bookCache.js';
import { getLibraryItems, getLibraryItem } from '../services/libraryItems.js';
import { isValidId } from '../lib/ids.js';

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
  quantity: 'quantity',
  acquiredDate: 'acquired_date',
  acquiredPlace: 'acquired_place',
};

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
  const { googleVolumeId, status, rating, notes, quantity, acquiredDate, acquiredPlace } =
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
  // quantity is optional on add and defaults to 1; if given it must be a whole
  // number >= 1 (you can't own a fraction of a book, or fewer than one).
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 1)) {
    return res.status(400).json({ error: 'quantity must be an integer >= 1' });
  }
  // notes and acquiredPlace are free text; when provided they must be strings.
  // (!= null lets them be omitted or explicitly null; this mirrors the PATCH rules.)
  if (notes != null && typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes must be a string' });
  }
  if (acquiredPlace != null && typeof acquiredPlace !== 'string') {
    return res.status(400).json({ error: 'acquiredPlace must be a string' });
  }

  try {
    // Figure out the catalog book (fetching from Google only if it's new) BEFORE
    // opening the transaction - see the bookCache module for why the split exists.
    const { bookId: existingId, volume } = await resolveBook(googleVolumeId);

    const item = await withTransaction(async (client) => {
      // Cache the book if it's new; otherwise reuse the existing catalog id.
      const bookId = existingId ?? (await cacheBook(client, volume));

      // Create THIS user's relationship to the book.
      const inserted = await client.query(
        `INSERT INTO user_books
           (user_id, book_id, status, rating, notes, quantity, acquired_date, acquired_place)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          req.userId, bookId, status, rating ?? null, notes ?? null,
          quantity ?? 1, acquiredDate ?? null, acquiredPlace ?? null,
        ]
      );

      // Re-read the row through the shared query so the response is the same
      // joined, camelCase, book-nested shape GET returns - not a raw row. We pass
      // the transaction client so this read sees the INSERT we just made.
      return getLibraryItem({ userId: req.userId, id: inserted.rows[0].id }, client);
    });

    return res.status(201).json({ item });
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
    const items = await getLibraryItems({ userId: req.userId, status: status ?? null });
    return res.json({ items });
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
  if (!isValidId(req.params.id)) {
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
    // quantity is NOT NULL in the schema, so unlike the others it can't be cleared.
    if (field === 'quantity' && (value === null || !Number.isInteger(value) || value < 1)) {
      return res.status(400).json({ error: 'quantity must be an integer >= 1' });
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

  const updateSql = `UPDATE user_books
          SET ${sets.join(', ')}
        WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}
        RETURNING id`;

  // Changing quantity touches the lending invariant (active lent-out copies must
  // not exceed quantity owned), so that path needs an atomic, locked guard. Every
  // other edit is a plain field update with no invariant, so it skips the
  // transaction entirely - a single UPDATE plus a read-after-write.
  const quantityChanging = Object.prototype.hasOwnProperty.call(body, 'quantity');

  try {
    let outcome;

    if (quantityChanging) {
      outcome = await withTransaction(async (client) => {
        // Lock THIS user_books row for the duration of the transaction. This
        // serializes against a concurrent loan-creation (which locks the same
        // row), so the count-then-update below can't race: we won't approve a
        // quantity that another in-flight request is about to invalidate.
        const locked = await client.query(
          `SELECT book_id FROM user_books
            WHERE id = $1 AND user_id = $2
            FOR UPDATE`,
          [req.params.id, req.userId]
        );
        if (locked.rowCount === 0) return { notFound: true };

        // How many copies are out on active (not-yet-returned) lent-out loans?
        const lent = await client.query(
          `SELECT count(*)::int AS n FROM loans
            WHERE user_id = $1 AND book_id = $2
              AND direction = 'lent_out' AND returned_on IS NULL`,
          [req.userId, locked.rows[0].book_id]
        );
        const lentOut = lent.rows[0].n;

        // You can't own fewer copies than you currently have lent out.
        if (body.quantity < lentOut) {
          return { conflict: lentOut };
        }

        const result = await client.query(updateSql, values);
        if (result.rowCount === 0) return { notFound: true };

        // Re-read through the shared query so PATCH returns the same joined,
        // book-nested shape as GET. The transaction client sees our own UPDATE.
        const item = await getLibraryItem({ userId: req.userId, id: req.params.id }, client);
        return { item };
      });
    } else {
      // No invariant in play -> no transaction. Update, then read the row back to
      // return GET's shape. The brief gap between the two writes/reads is harmless:
      // a user only ever edits their own rows.
      const result = await query(updateSql, values);
      if (result.rowCount === 0) {
        outcome = { notFound: true };
      } else {
        const item = await getLibraryItem({ userId: req.userId, id: req.params.id });
        outcome = { item };
      }
    }

    if (outcome.notFound) {
      return res.status(404).json({ error: 'library entry not found' });
    }
    if (outcome.conflict != null) {
      return res.status(409).json({
        error: `quantity can't be lower than the ${outcome.conflict} copy/copies currently lent out`,
      });
    }
    return res.json({ item: outcome.item });
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
// Remove a book from the user's collection. Any LENT-OUT loans for that book go
// too: those records exist because you own a copy, so once the owned entry is
// gone they're orphaned. BORROWED loans are deliberately left alone - borrowing a
// book doesn't depend on owning it, so removing your owned entry shouldn't erase
// an unrelated borrow. loans and user_books are sibling tables with no FK between
// them, so the DB won't cascade this for us - we do both writes inside ONE
// transaction so they succeed or fail together.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
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

      // Clear only this user's LENT-OUT loans for that book; borrowed loans stay.
      const loans = await client.query(
        `DELETE FROM loans
          WHERE user_id = $1 AND book_id = $2 AND direction = 'lent_out'`,
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
