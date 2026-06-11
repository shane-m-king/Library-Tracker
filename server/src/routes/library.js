import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { query, withTransaction } from '../db.js';
import { getVolume } from '../services/googleBooks.js';

const router = Router();

const VALID_STATUSES = ['owned', 'wishlist'];

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

export default router;
