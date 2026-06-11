import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query, withTransaction } from '../db.js';
import { resolveBook, cacheBook } from '../services/bookCache.js';

const router = Router();

const VALID_DIRECTIONS = ['lent_out', 'borrowed'];

// Fields a PATCH may change, mapped from API name to DB column. Same whitelist
// trick as the library routes: blocks mass-assignment and keeps the dynamic
// UPDATE injection-safe (columns come from here, never from the request). Note
// `direction` and the book aren't here - those define the loan; changing them
// would mean it's really a different loan.
const EDITABLE_LOAN_FIELDS = {
  counterpartyName: 'counterparty_name',
  dueDate: 'due_date',
  returnedOn: 'returned_on',
  notes: 'notes',
};

// Shape a joined loan row into the API contract: loan fields on top (with a
// convenience `active` flag), the catalog book nested under `book`.
function toLoanItem(row) {
  return {
    id: row.id,
    direction: row.direction,
    counterpartyName: row.counterparty_name,
    loanedOn: row.loaned_on,
    dueDate: row.due_date,
    returnedOn: row.returned_on,
    active: row.returned_on === null, // not yet returned
    notes: row.notes,
    createdAt: row.created_at,
    book: {
      id: row.book_id,
      googleVolumeId: row.google_volume_id,
      title: row.title,
      subtitle: row.subtitle,
      authors: row.authors,
      thumbnailUrl: row.thumbnail_url,
      smallThumbnailUrl: row.small_thumbnail_url,
    },
  };
}

// POST /api/loans
// Record a loan. Two directions, handled differently:
//
//   borrowed  - you have someone else's book. You may not own it, so we cache the
//               book on demand (just like adding to a library) and record the loan.
//               No quantity rule applies - it isn't your copy.
//
//   lent_out  - you've lent out a book you own. This requires an OWNED library
//               entry (that's where `quantity` lives), and it enforces the lending
//               invariant: you can't have more copies lent out than you own.
router.post('/', requireAuth, async (req, res) => {
  const { googleVolumeId, direction, counterpartyName, loanedOn, dueDate, notes } =
    req.body ?? {};

  // --- Validate ---
  if (!googleVolumeId) {
    return res.status(400).json({ error: 'googleVolumeId is required' });
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    return res.status(400).json({ error: "direction must be 'lent_out' or 'borrowed'" });
  }
  if (typeof counterpartyName !== 'string' || counterpartyName.trim() === '') {
    return res.status(400).json({ error: 'counterpartyName is required' });
  }

  // RETURNING shared by both branches. DATE columns are cast to text so they
  // serialize as plain 'YYYY-MM-DD' instead of timezone-shiftable Date objects.
  const returning = `RETURNING id, user_id, book_id, direction, counterparty_name,
                  loaned_on::text AS loaned_on, due_date::text AS due_date,
                  returned_on::text AS returned_on, notes, created_at`;

  try {
    if (direction === 'borrowed') {
      // Cache the book if we've never seen it, then record the loan.
      const { bookId: existingId, volume } = await resolveBook(googleVolumeId);

      const loan = await withTransaction(async (client) => {
        const bookId = existingId ?? (await cacheBook(client, volume));
        const result = await client.query(
          `INSERT INTO loans
             (user_id, book_id, direction, counterparty_name, loaned_on, due_date, notes)
           VALUES ($1, $2, 'borrowed', $3, COALESCE($4, CURRENT_DATE), $5, $6)
           ${returning}`,
          [req.userId, bookId, counterpartyName.trim(), loanedOn ?? null, dueDate ?? null, notes ?? null]
        );
        return result.rows[0];
      });

      return res.status(201).json({ item: loan });
    }

    // --- direction === 'lent_out' ---
    const outcome = await withTransaction(async (client) => {
      // The book must be in the catalog at all; if it isn't, the user can't own it.
      const book = await client.query(
        'SELECT id FROM books WHERE google_volume_id = $1',
        [googleVolumeId]
      );
      if (book.rowCount === 0) return { notOwned: true };
      const bookId = book.rows[0].id;

      // Lock the owned library row for this book. Locking here serializes against
      // a concurrent quantity change (PATCH /library locks the same row), so the
      // count-then-insert below can't race past the invariant.
      const owned = await client.query(
        `SELECT quantity FROM user_books
          WHERE user_id = $1 AND book_id = $2 AND status = 'owned'
          FOR UPDATE`,
        [req.userId, bookId]
      );
      if (owned.rowCount === 0) return { notOwned: true };
      const { quantity } = owned.rows[0];

      // How many copies are already out on active (not-yet-returned) loans?
      const lent = await client.query(
        `SELECT count(*)::int AS n FROM loans
          WHERE user_id = $1 AND book_id = $2
            AND direction = 'lent_out' AND returned_on IS NULL`,
        [req.userId, bookId]
      );
      const lentOut = lent.rows[0].n;

      if (lentOut >= quantity) {
        return { noCopies: { quantity, lentOut } };
      }

      const result = await client.query(
        `INSERT INTO loans
           (user_id, book_id, direction, counterparty_name, loaned_on, due_date, notes)
         VALUES ($1, $2, 'lent_out', $3, COALESCE($4, CURRENT_DATE), $5, $6)
         ${returning}`,
        [req.userId, bookId, counterpartyName.trim(), loanedOn ?? null, dueDate ?? null, notes ?? null]
      );
      return { loan: result.rows[0] };
    });

    if (outcome.notOwned) {
      return res
        .status(422)
        .json({ error: 'you must own this book (in your library) to lend it out' });
    }
    if (outcome.noCopies) {
      return res.status(409).json({
        error: `all ${outcome.noCopies.quantity} owned copy/copies are already lent out`,
      });
    }
    return res.status(201).json({ item: outcome.loan });
  } catch (err) {
    // A malformed loanedOn/dueDate reaches Postgres as an invalid date value.
    if (err.code === '22007' || err.code === '22008') {
      return res
        .status(400)
        .json({ error: 'loanedOn and dueDate must be valid dates (YYYY-MM-DD)' });
    }
    // err.status is set by the Google Books service when caching a borrowed book.
    if (err.status) {
      const message =
        err.status === 429
          ? 'Google Books rate limit reached. Try again shortly.'
          : 'could not fetch that book from Google Books';
      return res.status(502).json({ error: message });
    }
    console.error('Creating loan failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// GET /api/loans
// List the user's loans, newest first. Optional filters:
//   ?direction=lent_out|borrowed
//   ?active=true|false   (active = not yet returned)
router.get('/', requireAuth, async (req, res) => {
  const { direction } = req.query;

  if (direction != null && !VALID_DIRECTIONS.includes(direction)) {
    return res
      .status(400)
      .json({ error: "direction filter must be 'lent_out' or 'borrowed'" });
  }

  // Parse the active filter into a real boolean (or null = no filter).
  let active = null;
  if (req.query.active === 'true') active = true;
  else if (req.query.active === 'false') active = false;
  else if (req.query.active != null) {
    return res.status(400).json({ error: "active filter must be 'true' or 'false'" });
  }

  try {
    // Same optional-filter trick as the library list: each "$n IS NULL OR ..."
    // clause is a no-op when that filter wasn't supplied. For active we compare the
    // boolean expression (returned_on IS NULL) directly against the requested flag.
    const result = await query(
      `SELECT
         l.id, l.direction, l.counterparty_name,
         l.loaned_on::text  AS loaned_on,
         l.due_date::text   AS due_date,
         l.returned_on::text AS returned_on,
         l.notes, l.created_at,
         b.id AS book_id, b.google_volume_id, b.title, b.subtitle,
         b.thumbnail_url, b.small_thumbnail_url,
         COALESCE(
           (SELECT array_agg(a.name ORDER BY ba.position)
              FROM book_authors ba JOIN authors a ON a.id = ba.author_id
             WHERE ba.book_id = b.id),
           '{}'
         ) AS authors
       FROM loans l
       JOIN books b ON b.id = l.book_id
       WHERE l.user_id = $1
         AND ($2::text IS NULL OR l.direction = $2)
         AND ($3::boolean IS NULL OR (l.returned_on IS NULL) = $3)
       ORDER BY l.created_at DESC`,
      [req.userId, direction ?? null, active]
    );

    return res.json({ items: result.rows.map(toLoanItem) });
  } catch (err) {
    console.error('Listing loans failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// PATCH /api/loans/:id
// Update a loan - most often to mark it returned (set returnedOn to a date), but
// also to adjust the due date, notes, or counterparty. Same partial-update
// semantics as the library PATCH. Marking a lent-out loan returned frees a copy,
// which is always safe, so there's no invariant guard here.
router.patch('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'loan not found' });
  }

  const body = req.body ?? {};
  const sets = [];
  const values = [];

  for (const [field, column] of Object.entries(EDITABLE_LOAN_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue; // omitted -> leave alone
    const value = body[field];

    // counterparty_name is NOT NULL, so it can't be cleared and must be non-empty.
    if (field === 'counterpartyName' && (typeof value !== 'string' || value.trim() === '')) {
      return res.status(400).json({ error: 'counterpartyName must be a non-empty string' });
    }
    if (field === 'notes' && value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: 'notes must be a string or null' });
    }
    // dueDate / returnedOn: a string date or null (null clears it). Postgres
    // validates the actual date format and we map that error below.

    values.push(field === 'counterpartyName' ? value.trim() : value);
    sets.push(`${column} = $${values.length}`);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'no updatable fields provided' });
  }

  values.push(req.params.id, req.userId);
  const idPlaceholder = `$${values.length - 1}`;
  const userPlaceholder = `$${values.length}`;

  try {
    const result = await query(
      `UPDATE loans
          SET ${sets.join(', ')}
        WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}
        RETURNING id, user_id, book_id, direction, counterparty_name,
                  loaned_on::text AS loaned_on, due_date::text AS due_date,
                  returned_on::text AS returned_on, notes, created_at`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'loan not found' });
    }
    return res.json({ item: result.rows[0] });
  } catch (err) {
    if (err.code === '22007' || err.code === '22008') {
      return res
        .status(400)
        .json({ error: 'dueDate and returnedOn must be valid dates (YYYY-MM-DD)' });
    }
    console.error('Updating loan failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

// DELETE /api/loans/:id
// Remove a loan record. loans is a leaf table (nothing references it), so this is
// a plain scoped delete - no cascade needed.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'loan not found' });
  }

  try {
    const result = await query(
      'DELETE FROM loans WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'loan not found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Deleting loan failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
});

export default router;
