// Shared "make sure this book is in our catalog" logic, used by both adding a
// book to a library and recording a borrowed loan. It's split into two halves on
// purpose, around the transaction boundary:
//
//   resolveBook() - runs OUTSIDE a transaction. It may make a (slow) network call
//                   to Google, so we never want it holding a DB transaction open.
//   cacheBook()   - runs INSIDE a transaction, doing only fast local DB writes.
//
// The caller orchestrates: resolve first, then open a transaction and cache only
// if needed.

import { query } from '../db.js';
import { getVolume } from './googleBooks.js';

// Decide what we need before touching a transaction. If the book is already
// cached, hand back its catalog id. If not, fetch the authoritative volume from
// Google so the caller can cache it inside their transaction.
export async function resolveBook(googleVolumeId) {
  const cached = await query(
    'SELECT id FROM books WHERE google_volume_id = $1',
    [googleVolumeId]
  );
  if (cached.rows[0]) {
    return { bookId: cached.rows[0].id, volume: null };
  }
  const volume = await getVolume(googleVolumeId);
  return { bookId: null, volume };
}

// Insert a fetched volume into the shared catalog - the book plus its authors and
// genres - and return the catalog book id. Must be called with a transaction
// client. Every write is idempotent via ON CONFLICT, so if another request cached
// the same book in a race, we reconcile instead of erroring. (The "DO UPDATE ... =
// EXCLUDED" is a deliberate no-op that just lets RETURNING fire on conflict, which
// DO NOTHING would not.)
export async function cacheBook(client, volume) {
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
  const bookId = inserted.rows[0].id;

  // Authors: upsert each name, then link to the book preserving order via position.
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

  // Genres: same upsert-then-link, no ordering to preserve.
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

  return bookId;
}
